import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PoolClient } from 'pg';
import { createHash, randomBytes } from 'node:crypto';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../common/cache/cache.module';
import { UserSession } from '../domain/user-session.entity';
import { JwtSigner } from '../domain/crypto/jwt.service';
import { PostgresUserSessionRepository } from '../infrastructure/postgres-iam.repository';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // segundos para access token
  sessionId: string;
}

export interface CreateSessionOptions {
  tenantId: string;
  userId: string;
  email: string;
  deviceId?: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  mfaVerified?: boolean;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly jwtSecret: string;
  private readonly accessTokenTtlSeconds = 15 * 60; // 15 minutos
  private readonly sessionTtlSeconds = 7 * 24 * 60 * 60; // 7 dias

  constructor(
    private readonly sessionRepo: PostgresUserSessionRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
  ) {
    this.jwtSecret =
      this.config.get<string>('JWT_SECRET') ??
      'transport-platform-super-secure-jwt-secret-key-32b';
  }

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private getRedisSessionKey(sessionId: string): string {
    return `iam:session:${sessionId}`;
  }

  async createSession(
    client: PoolClient,
    opts: CreateSessionOptions,
  ): Promise<TokenPair> {
    const rawRefreshToken = randomBytes(32).toString('hex');
    const refreshTokenHash = SessionService.hashToken(rawRefreshToken);

    const session = UserSession.create({
      tenantId: opts.tenantId,
      userId: opts.userId,
      deviceId: opts.deviceId,
      deviceName: opts.deviceName,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
      refreshTokenHash,
      durationMs: this.sessionTtlSeconds * 1000,
    });

    await this.sessionRepo.save(client, session);

    // Grava no Redis para verificação ultra-rápida no Guard
    try {
      await this.redis.set(
        this.getRedisSessionKey(session.id),
        JSON.stringify({
          tenantId: session.tenantId,
          userId: session.userId,
          mfaVerified: Boolean(opts.mfaVerified),
        }),
        'EX',
        this.sessionTtlSeconds,
      );
    } catch (err) {
      this.logger.warn(`Redis session write failed, relying on PostgreSQL fallback: ${(err as Error).message}`);
    }

    const accessToken = JwtSigner.sign(
      {
        sub: session.userId,
        tenant_id: session.tenantId,
        session_id: session.id,
        email: opts.email,
        mfa_verified: Boolean(opts.mfaVerified),
      },
      this.jwtSecret,
      this.accessTokenTtlSeconds,
    );

    return {
      accessToken,
      refreshToken: `${session.id}.${rawRefreshToken}`,
      expiresIn: this.accessTokenTtlSeconds,
      sessionId: session.id,
    };
  }

  async refreshTokens(
    client: PoolClient,
    tenantId: string,
    compositeRefreshToken: string,
    email: string,
  ): Promise<TokenPair> {
    const parts = compositeRefreshToken.split('.');
    if (parts.length !== 2) {
      throw new Error('Invalid refresh token format');
    }

    const [sessionId, rawToken] = parts;
    const tokenHash = SessionService.hashToken(rawToken);

    const session = await this.sessionRepo.findById(client, tenantId, sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.isActive()) {
      throw new Error('Session is revoked or expired');
    }

    // Detecção de reuso de refresh token
    if (session.refreshTokenHash !== tokenHash) {
      // Reuso suspeito detectado: revoga a sessão preventivamente
      session.revoke('SUSPECTED_TOKEN_REUSE');
      await this.sessionRepo.save(client, session);
      await this.invalidateRedisSession(sessionId);
      this.logger.error(`Suspected refresh token reuse detected for session ${sessionId}, tenant ${tenantId}`);
      throw new Error('Invalid refresh token: token reuse detected');
    }

    const newRawRefreshToken = randomBytes(32).toString('hex');
    const newRefreshTokenHash = SessionService.hashToken(newRawRefreshToken);

    session.rotateRefreshToken(newRefreshTokenHash, this.sessionTtlSeconds * 1000);
    await this.sessionRepo.save(client, session);

    // Atualiza Redis TTL
    try {
      await this.redis.set(
        this.getRedisSessionKey(session.id),
        JSON.stringify({
          tenantId: session.tenantId,
          userId: session.userId,
        }),
        'EX',
        this.sessionTtlSeconds,
      );
    } catch (err) {
      this.logger.warn(`Redis session update failed: ${(err as Error).message}`);
    }

    const accessToken = JwtSigner.sign(
      {
        sub: session.userId,
        tenant_id: session.tenantId,
        session_id: session.id,
        email,
      },
      this.jwtSecret,
      this.accessTokenTtlSeconds,
    );

    return {
      accessToken,
      refreshToken: `${session.id}.${newRawRefreshToken}`,
      expiresIn: this.accessTokenTtlSeconds,
      sessionId: session.id,
    };
  }

  async revokeSession(
    client: PoolClient,
    tenantId: string,
    sessionId: string,
    reason = 'USER_LOGOUT',
  ): Promise<void> {
    const session = await this.sessionRepo.findById(client, tenantId, sessionId);
    if (session) {
      session.revoke(reason);
      await this.sessionRepo.save(client, session);
    }
    await this.invalidateRedisSession(sessionId);
  }

  async revokeAllUserSessions(
    client: PoolClient,
    tenantId: string,
    userId: string,
    reason = 'REVOKE_ALL_SESSIONS',
  ): Promise<void> {
    const activeSessions = await this.sessionRepo.listActiveByUserId(client, tenantId, userId);
    await this.sessionRepo.revokeAllForUser(client, tenantId, userId, reason);

    for (const session of activeSessions) {
      await this.invalidateRedisSession(session.id);
    }
  }

  async isSessionActive(
    client: PoolClient,
    tenantId: string,
    sessionId: string,
  ): Promise<boolean> {
    try {
      const cached = await this.redis.get(this.getRedisSessionKey(sessionId));
      if (cached) {
        const parsed = JSON.parse(cached) as { tenantId: string; userId: string };
        return parsed.tenantId === tenantId;
      }
    } catch {
      // Ignora falha de Redis e recorre ao banco
    }

    // Fallback para o PostgreSQL
    const session = await this.sessionRepo.findById(client, tenantId, sessionId);
    if (session && session.isActive()) {
      try {
        await this.redis.set(
          this.getRedisSessionKey(sessionId),
          JSON.stringify({ tenantId: session.tenantId, userId: session.userId }),
          'EX',
          this.sessionTtlSeconds,
        );
      } catch {
        // Ignora erro no repovoamento de cache
      }
      return true;
    }

    return false;
  }

  private async invalidateRedisSession(sessionId: string): Promise<void> {
    try {
      await this.redis.del(this.getRedisSessionKey(sessionId));
    } catch (err) {
      this.logger.warn(`Failed to delete session ${sessionId} from Redis: ${(err as Error).message}`);
    }
  }
}

