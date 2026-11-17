import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { REDIS_CLIENT } from '../../../common/cache/cache.module';
import { RequestContextService } from '../../../common/observability/request-context.service';
import { JwtPayload, JwtSigner } from '../domain/crypto/jwt.service';
import { PostgresUserSessionRepository } from '../infrastructure/postgres-iam.repository';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly sessionRepo: PostgresUserSessionRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly requestContext: RequestContextService,
  ) {
    this.jwtSecret =
      this.config.get<string>('JWT_SECRET') ??
      'transport-platform-super-secure-jwt-secret-key-32b';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization header format');
    }

    let payload: JwtPayload;
    try {
      payload = JwtSigner.verify<JwtPayload>(token, this.jwtSecret);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Valida status da sessão (Redis em sub-milissegundo ou fallback PostgreSQL)
    const isSessionValid = await this.validateSession(payload.tenant_id, payload.session_id);
    if (!isSessionValid) {
      throw new UnauthorizedException('Session has been revoked or expired');
    }

    // Anexa usuário na request
    request.user = payload;

    // Atualiza RequestContext
    const ctx = this.requestContext.get();
    if (ctx) {
      ctx.tenantId = payload.tenant_id;
      ctx.userId = payload.sub;
      ctx.sessionId = payload.session_id;
    }

    return true;
  }

  private async validateSession(tenantId: string, sessionId: string): Promise<boolean> {
    const redisKey = `iam:session:${sessionId}`;
    try {
      const cached = await this.redis.get(redisKey);
      if (cached) {
        const data = JSON.parse(cached) as { tenantId: string; userId: string };
        return data.tenantId === tenantId;
      }
    } catch {
      // Ignora erro no Redis e tenta fallback no PostgreSQL
    }

    // Fallback no PostgreSQL
    try {
      const client = await this.pool.connect();
      try {
        const session = await this.sessionRepo.findById(client, tenantId, sessionId);
        if (session && session.isActive()) {
          // Repopula Redis
          try {
            await this.redis.set(
              redisKey,
              JSON.stringify({ tenantId: session.tenantId, userId: session.userId }),
              'EX',
              7 * 24 * 60 * 60,
            );
          } catch {
            // Ignora falha de cache
          }
          return true;
        }
        return false;
      } finally {
        client.release();
      }
    } catch (err) {
      this.logger.error(`Database session validation error: ${(err as Error).message}`);
      return false;
    }
  }
}
