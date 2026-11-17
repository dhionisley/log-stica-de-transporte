import {
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { PostgresOutboxRepository } from '../../outbox/infrastructure/postgres-outbox.repository';
import { JwtSigner } from '../domain/crypto/jwt.service';
import { PasswordHasher } from '../domain/crypto/password-hasher';
import { UserCredentials } from '../domain/user-credentials.entity';
import {
  PostgresUserCredentialsRepository,
  PostgresUserRepository,
  PostgresUserProfileAssignmentRepository,
  PostgresPermissionProfileRepository,
} from '../infrastructure/postgres-iam.repository';
import { SessionService, type TokenPair } from './session.service';
import { MfaService } from './mfa.service';

export interface LoginParams {
  tenantId: string;
  email: string;
  password: string;
  deviceId?: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
}

export type LoginResult =
  | {
      status: 'AUTHENTICATED';
      tokens: TokenPair;
      user: {
        id: string;
        tenantId: string;
        email: string;
        mfaRequired: boolean;
      };
    }
  | {
      status: 'MFA_REQUIRED';
      mfaTicket: string;
      expiresIn: number;
    };

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly mfaTicketTtlSeconds = 300; // 5 minutos

  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly userRepo: PostgresUserRepository,
    private readonly credentialsRepo: PostgresUserCredentialsRepository,
    private readonly assignmentRepo: PostgresUserProfileAssignmentRepository,
    private readonly profileRepo: PostgresPermissionProfileRepository,
    private readonly sessionService: SessionService,
    private readonly mfaService: MfaService,
    private readonly outboxRepository: PostgresOutboxRepository,
    private readonly config: ConfigService,
  ) {
    this.jwtSecret =
      this.config.get<string>('JWT_SECRET') ??
      'transport-platform-super-secure-jwt-secret-key-32b';
  }

  private async withTransaction<T>(
    tenantId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async login(params: LoginParams): Promise<LoginResult> {
    return this.withTransaction(params.tenantId, async (client) => {
      const normalizedEmail = params.email.trim().toLowerCase();

      // 1. Busca usuário
      const user = await this.userRepo.findByEmail(client, params.tenantId, normalizedEmail);
      if (!user) {
        await this.auditLoginAttempt(client, params.tenantId, null, normalizedEmail, false, 'USER_NOT_FOUND');
        throw new UnauthorizedException('Invalid credentials');
      }

      if (user.status !== 'ACTIVE') {
        await this.auditLoginAttempt(client, params.tenantId, user.id, normalizedEmail, false, `USER_STATUS_${user.status}`);
        throw new ForbiddenException('User is not active');
      }

      // 2. Busca e valida credenciais de senha
      const credentials = await this.credentialsRepo.findByUserId(client, params.tenantId, user.id);
      if (!credentials) {
        await this.auditLoginAttempt(client, params.tenantId, user.id, normalizedEmail, false, 'NO_CREDENTIALS_SET');
        throw new UnauthorizedException('Invalid credentials');
      }

      if (credentials.isLocked()) {
        await this.auditLoginAttempt(client, params.tenantId, user.id, normalizedEmail, false, 'ACCOUNT_LOCKED');
        throw new UnauthorizedException('Account temporarily locked due to excessive failed attempts');
      }

      const isValidPassword = await credentials.verifyPassword(params.password);
      await this.credentialsRepo.save(client, credentials);

      if (!isValidPassword) {
        await this.auditLoginAttempt(client, params.tenantId, user.id, normalizedEmail, false, 'INVALID_PASSWORD');
        throw new UnauthorizedException('Invalid credentials');
      }

      // 3. Determina se MFA é obrigatório
      const requiresMfa = await this.checkIfMfaRequired(client, user.tenantId, user.id, user.mfaRequired);

      if (requiresMfa) {
        const mfaTicket = JwtSigner.sign(
          {
            sub: user.id,
            tenant_id: user.tenantId,
            email: user.email,
            type: 'mfa_challenge',
          },
          this.jwtSecret,
          this.mfaTicketTtlSeconds,
        );

        return {
          status: 'MFA_REQUIRED',
          mfaTicket,
          expiresIn: this.mfaTicketTtlSeconds,
        };
      }

      // 4. Cria sessão completa se MFA não for exigido
      const tokens = await this.sessionService.createSession(client, {
        tenantId: user.tenantId,
        userId: user.id,
        email: user.email,
        deviceId: params.deviceId,
        deviceName: params.deviceName,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        mfaVerified: false,
      });

      user.recordLogin();
      await this.userRepo.save(client, user);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId: user.tenantId,
        aggregateType: 'User',
        aggregateId: user.id,
        eventType: 'UserAuthenticated',
        aggregateVersion: user.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        payload: {
          userId: user.id,
          sessionId: tokens.sessionId,
          authenticatedAt: new Date().toISOString(),
          ipAddress: params.ipAddress ?? null,
        },
      });

      await this.auditLoginAttempt(client, user.tenantId, user.id, user.email, true, 'SUCCESS');

      return {
        status: 'AUTHENTICATED',
        tokens,
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          mfaRequired: user.mfaRequired,
        },
      };
    });
  }

  async verifyMfaChallenge(
    mfaTicket: string,
    codeOrBackupCode: string,
    deviceInfo?: { deviceId?: string; deviceName?: string; ipAddress?: string; userAgent?: string },
  ): Promise<LoginResult> {
    let payload: { sub: string; tenant_id: string; email: string; type: string };
    try {
      payload = JwtSigner.verify(mfaTicket, this.jwtSecret);
    } catch {
      throw new UnauthorizedException('Invalid or expired MFA ticket');
    }

    if (payload.type !== 'mfa_challenge') {
      throw new UnauthorizedException('Invalid ticket purpose');
    }

    return this.withTransaction(payload.tenant_id, async (client) => {
      const user = await this.userRepo.findById(client, payload.tenant_id, payload.sub);
      if (!user || user.status !== 'ACTIVE') {
        throw new ForbiddenException('User is not active');
      }

      const isValid = await this.mfaService.verifyMfaChallenge(
        client,
        user.tenantId,
        user.id,
        codeOrBackupCode,
      );

      if (!isValid) {
        await this.auditLoginAttempt(client, user.tenantId, user.id, user.email, false, 'INVALID_MFA_CODE');
        throw new UnauthorizedException('Invalid MFA verification code');
      }

      const tokens = await this.sessionService.createSession(client, {
        tenantId: user.tenantId,
        userId: user.id,
        email: user.email,
        deviceId: deviceInfo?.deviceId,
        deviceName: deviceInfo?.deviceName,
        ipAddress: deviceInfo?.ipAddress,
        userAgent: deviceInfo?.userAgent,
        mfaVerified: true,
      });

      user.recordLogin();
      await this.userRepo.save(client, user);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId: user.tenantId,
        aggregateType: 'User',
        aggregateId: user.id,
        eventType: 'MfaChallengeVerified',
        aggregateVersion: user.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        payload: {
          userId: user.id,
          sessionId: tokens.sessionId,
          verifiedAt: new Date().toISOString(),
        },
      });

      await this.auditLoginAttempt(client, user.tenantId, user.id, user.email, true, 'MFA_SUCCESS');

      return {
        status: 'AUTHENTICATED',
        tokens,
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          mfaRequired: user.mfaRequired,
        },
      };
    });
  }

  async setUserPassword(
    tenantId: string,
    userId: string,
    plainPassword: string,
    actorId?: string,
  ): Promise<void> {
    const { hash, salt, params } = await PasswordHasher.hashPassword(plainPassword);

    await this.withTransaction(tenantId, async (client) => {
      let credentials = await this.credentialsRepo.findByUserId(client, tenantId, userId);
      if (!credentials) {
        credentials = UserCredentials.create({
          tenantId,
          userId,
          passwordHash: hash,
          passwordSalt: salt,
          params,
        });
      } else {
        credentials.updatePassword(hash, salt, params);
      }

      await this.credentialsRepo.save(client, credentials);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'UserCredentials',
        aggregateId: credentials.id,
        eventType: 'UserPasswordUpdated',
        aggregateVersion: 1,
        schemaVersion: 1,
        occurredAt: new Date(),
        payload: {
          userId,
          updatedAt: credentials.updatedAt.toISOString(),
          actorId: actorId ?? null,
        },
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           id, tenant_id, actor_id, action, resource_type, resource_id, after_state, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
        [
          randomUUID(),
          tenantId,
          actorId ? toUuidOrNull(actorId) : null,
          'user.password_updated',
          'UserCredentials',
          userId,
          JSON.stringify({ userId, actorId }),
        ],
      );
    });
  }

  async refreshTokens(tenantId: string, refreshToken: string, email: string): Promise<TokenPair> {
    return this.withTransaction(tenantId, async (client) => {
      return this.sessionService.refreshTokens(client, tenantId, refreshToken, email);
    });
  }

  async logout(tenantId: string, sessionId: string): Promise<void> {
    return this.withTransaction(tenantId, async (client) => {
      await this.sessionService.revokeSession(client, tenantId, sessionId, 'USER_LOGOUT');
    });
  }

  private async checkIfMfaRequired(
    client: PoolClient,
    tenantId: string,
    userId: string,
    userMfaRequired: boolean,
  ): Promise<boolean> {
    if (userMfaRequired) {
      return true;
    }

    // Perfis privilegiados (ADMIN e SUPERVISOR) exigem MFA obrigatório por arquitetura
    const activeAssignments = await this.assignmentRepo.findActiveByUserId(client, tenantId, userId);
    for (const assignment of activeAssignments) {
      const profile = await this.profileRepo.findById(client, tenantId, assignment.profileId);
      if (profile) {
        const normalizedName = profile.name.trim().toLowerCase();
        if (
          normalizedName.includes('admin') ||
          normalizedName.includes('supervisor') ||
          profile.profileType === 'ADMIN' ||
          profile.profileType === 'SUPERVISOR'
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private async auditLoginAttempt(
    client: PoolClient,
    tenantId: string,
    userId: string | null,
    email: string,
    success: boolean,
    reason: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit.audit_records (
         id, tenant_id, actor_id, action, resource_type, resource_id, after_state, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        randomUUID(),
        tenantId,
        userId ? toUuidOrNull(userId) : null,
        success ? 'auth.login_success' : 'auth.login_failed',
        'User',
        userId ?? randomUUID(),
        JSON.stringify({ email, success, reason, timestamp: new Date().toISOString() }),
      ],
    );
  }
}

function toUuidOrNull(value: string | undefined): string | null {
  if (!value) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value) ? value : null;
}
