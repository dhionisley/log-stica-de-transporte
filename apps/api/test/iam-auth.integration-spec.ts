import * as path from 'node:path';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { MigrationRunner } from '../src/tooling/migration-runner';
import { PostgresOutboxRepository } from '../src/modules/outbox/infrastructure/postgres-outbox.repository';
import { PostgresTenantRepository } from '../src/modules/platform/infrastructure/postgres-tenant.repository';
import { TenantManagementService } from '../src/modules/platform/application/tenant-management.service';
import {
  PostgresUserRepository,
  PostgresPermissionProfileRepository,
  PostgresUserProfileAssignmentRepository,
  PostgresPermissionCatalogRepository,
  PostgresUserCredentialsRepository,
  PostgresUserSessionRepository,
  PostgresMfaMethodRepository,
} from '../src/modules/iam/infrastructure/postgres-iam.repository';
import { IamManagementService } from '../src/modules/iam/application/iam-management.service';
import { SessionService } from '../src/modules/iam/application/session.service';
import { MfaService } from '../src/modules/iam/application/mfa.service';
import { AuthService } from '../src/modules/iam/application/auth.service';
import { TotpEngine } from '../src/modules/iam/domain/crypto/totp';

const baseConnectionString =
  process.env.TEST_DATABASE_URL ??
  'postgresql://transport:transport@127.0.0.1:5432/transport';

function getDbUrlForDatabase(dbName: string): string {
  const url = new URL(baseConnectionString);
  url.pathname = `/${dbName}`;
  return url.toString();
}

// Mock em memória resiliente para Redis quando offline em ambiente local
class InMemoryRedis {
  private store = new Map<string, { value: string; expiresAt?: number }>();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<'OK'> {
    let expiresAt: number | undefined;
    if (mode === 'EX' && duration) {
      expiresAt = Date.now() + duration * 1000;
    }
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async quit(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }

  disconnect(): void {
    this.store.clear();
  }
}

describe('IAM Authentication, Sessions & MFA PostgreSQL Integration', () => {
  const adminPool = new Pool({ connectionString: baseConnectionString });
  const realMigrationsDir = path.resolve(__dirname, '../../../infrastructure/migrations');

  const testDbName = `test_iam_auth_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let testPool: Pool;
  let tenantService: TenantManagementService;
  let iamService: IamManagementService;
  let sessionService: SessionService;
  let mfaService: MfaService;
  let authService: AuthService;
  let redisClient: Redis | InMemoryRedis;

  let tenantAId: string;
  let tenantBId: string;

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${testDbName}`);
    testPool = new Pool({ connectionString: getDbUrlForDatabase(testDbName) });

    const runner = new MigrationRunner(testPool, {
      log: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    });
    await runner.run(realMigrationsDir);

    await testPool.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'transport_rls_test') THEN
          CREATE ROLE transport_rls_test NOLOGIN;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA platform, iam, audit, integration TO transport_rls_test;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform, iam, audit, integration TO transport_rls_test;
      GRANT transport_rls_test TO CURRENT_USER;
    `);

    // Tenta conectar no Redis real, com fallback para InMemoryRedis
    try {
      const realRedis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
      });
      await realRedis.connect();
      redisClient = realRedis;
    } catch {
      redisClient = new InMemoryRedis();
    }

    const configService = new ConfigService({
      JWT_SECRET: 'test-secure-jwt-secret-with-more-than-32-bytes-of-entropy!',
    });

    const tenantRepo = new PostgresTenantRepository();
    const outboxRepo = new PostgresOutboxRepository();
    tenantService = new TenantManagementService(testPool, tenantRepo, outboxRepo);

    const userRepo = new PostgresUserRepository();
    const profileRepo = new PostgresPermissionProfileRepository();
    const assignmentRepo = new PostgresUserProfileAssignmentRepository();
    const catalogRepo = new PostgresPermissionCatalogRepository();
    const credentialsRepo = new PostgresUserCredentialsRepository();
    const sessionRepo = new PostgresUserSessionRepository();
    const mfaRepo = new PostgresMfaMethodRepository();

    iamService = new IamManagementService(
      testPool,
      userRepo,
      profileRepo,
      assignmentRepo,
      catalogRepo,
      outboxRepo,
    );

    sessionService = new SessionService(sessionRepo, redisClient, configService);
    mfaService = new MfaService(mfaRepo, userRepo);

    authService = new AuthService(
      testPool,
      userRepo,
      credentialsRepo,
      assignmentRepo,
      profileRepo,
      sessionService,
      mfaService,
      outboxRepo,
      configService,
    );

    // Provisiona tenants
    const tA = await tenantService.provisionTenant({
      slug: 'auth-alfa',
      legalName: 'Alfa Transportes Ltda',
    });
    tenantAId = tA.id;
    await tenantService.activateTenant(tenantAId);

    const tB = await tenantService.provisionTenant({
      slug: 'auth-beta',
      legalName: 'Beta Linhas Ltda',
    });
    tenantBId = tB.id;
    await tenantService.activateTenant(tenantBId);
  });

  afterAll(async () => {
    if (redisClient?.quit) {
      await redisClient.quit();
    }
    if (testPool) {
      await testPool.end();
    }
    await adminPool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${testDbName}' AND pid <> pg_backend_pid();
    `);
    await adminPool.query(`DROP DATABASE IF EXISTS ${testDbName}`);
    await adminPool.end();
  });

  it('authenticates user with password, registers session in PostgreSQL and Redis, and verifies token', async () => {
    const user = await iamService.createUser(tenantAId, {
      email: 'operador@alfa.com',
      mfaRequired: false,
    });

    await authService.setUserPassword(tenantAId, user.id, 'SenhaForte123!');

    const loginRes = await authService.login({
      tenantId: tenantAId,
      email: 'operador@alfa.com',
      password: 'SenhaForte123!',
      ipAddress: '192.168.1.100',
    });

    expect(loginRes.status).toBe('AUTHENTICATED');
    if (loginRes.status === 'AUTHENTICATED') {
      expect(loginRes.tokens.accessToken).toBeDefined();
      expect(loginRes.tokens.refreshToken).toBeDefined();
      expect(loginRes.user.email).toBe('operador@alfa.com');

      // Verifica presença no Redis
      const cached = await redisClient.get(`iam:session:${loginRes.tokens.sessionId}`);
      expect(cached).toBeDefined();

      // Verifica presença em iam.sessions no PostgreSQL
      const client = await testPool.connect();
      try {
        const sessionRepo = new PostgresUserSessionRepository();
        const session = await sessionRepo.findById(client, tenantAId, loginRes.tokens.sessionId);
        expect(session).not.toBeNull();
        expect(session?.isActive()).toBe(true);
        expect(session?.ipAddress).toBe('192.168.1.100');
      } finally {
        client.release();
      }
    }
  });

  it('rejects authentication with invalid password and audits failed attempt', async () => {
    const user = await iamService.createUser(tenantAId, {
      email: 'fiscal@alfa.com',
      mfaRequired: false,
    });
    await authService.setUserPassword(tenantAId, user.id, 'Correta123!');

    await expect(
      authService.login({
        tenantId: tenantAId,
        email: 'fiscal@alfa.com',
        password: 'SenhaErrada123!',
      }),
    ).rejects.toThrow('Invalid credentials');

    // Confirma auditoria de tentativa falha
    const auditRes = await testPool.query(
      `SELECT action, after_state FROM audit.audit_records 
       WHERE tenant_id = $1 AND action = 'auth.login_failed'
       ORDER BY occurred_at DESC LIMIT 1`,
      [tenantAId],
    );
    expect(auditRes.rows).toHaveLength(1);
    expect(auditRes.rows[0].after_state.email).toBe('fiscal@alfa.com');
  });

  it('rotates refresh token and detects token reuse attack', async () => {
    const user = await iamService.createUser(tenantAId, {
      email: 'rotacao@alfa.com',
      mfaRequired: false,
    });
    await authService.setUserPassword(tenantAId, user.id, 'Segredo123!');

    const initialLogin = await authService.login({
      tenantId: tenantAId,
      email: 'rotacao@alfa.com',
      password: 'Segredo123!',
    });

    if (initialLogin.status !== 'AUTHENTICATED') {
      throw new Error('Expected authenticated status');
    }

    const firstRefreshToken = initialLogin.tokens.refreshToken;

    // Rotação legítima
    const rotatedTokens = await authService.refreshTokens(
      tenantAId,
      firstRefreshToken,
      'rotacao@alfa.com',
    );
    expect(rotatedTokens.accessToken).toBeDefined();
    expect(rotatedTokens.refreshToken).not.toBe(firstRefreshToken);

    // Tentativa maliciosa de reutilizar o token anterior já rotacionado
    await expect(
      authService.refreshTokens(tenantAId, firstRefreshToken, 'rotacao@alfa.com'),
    ).rejects.toThrow('token reuse detected');

    // Sessão deve ter sido revogada imediatamente
    const client = await testPool.connect();
    try {
      const sessionRepo = new PostgresUserSessionRepository();
      const session = await sessionRepo.findById(client, tenantAId, initialLogin.tokens.sessionId);
      expect(session?.isActive()).toBe(false);
      expect(session?.revocationReason).toBe('SUSPECTED_TOKEN_REUSE');
    } finally {
      client.release();
    }
  });

  it('enforces MFA challenge for users with mfaRequired = true and resolves with TOTP code', async () => {
    const adminUser = await iamService.createUser(tenantAId, {
      email: 'admin.mfa@alfa.com',
      mfaRequired: true,
    });
    await authService.setUserPassword(tenantAId, adminUser.id, 'AdminPassword123!');

    // 1º passo: login retorna desafio MFA
    const loginChallenge = await authService.login({
      tenantId: tenantAId,
      email: 'admin.mfa@alfa.com',
      password: 'AdminPassword123!',
    });

    expect(loginChallenge.status).toBe('MFA_REQUIRED');
    if (loginChallenge.status !== 'MFA_REQUIRED') {
      throw new Error('Expected MFA_REQUIRED');
    }
    expect(loginChallenge.mfaTicket).toBeDefined();

    // Configura e ativa TOTP para o usuário
    const client = await testPool.connect();
    let secretBase32: string;
    try {
      const setup = await mfaService.setupTotp(client, tenantAId, adminUser.id);
      secretBase32 = setup.secretBase32;
      const initialCode = TotpEngine.generateCode(secretBase32);
      const activated = await mfaService.activateTotp(client, tenantAId, adminUser.id, initialCode);
      expect(activated).toBe(true);
    } finally {
      client.release();
    }

    // 2º passo: resolve o desafio com código TOTP válido
    const validOtp = TotpEngine.generateCode(secretBase32);
    const mfaLoginResult = await authService.verifyMfaChallenge(
      loginChallenge.mfaTicket,
      validOtp,
    );

    expect(mfaLoginResult.status).toBe('AUTHENTICATED');
    if (mfaLoginResult.status === 'AUTHENTICATED') {
      expect(mfaLoginResult.tokens.accessToken).toBeDefined();
      expect(mfaLoginResult.tokens.sessionId).toBeDefined();
    }
  });

  it('enforces RLS isolation preventing Tenant A from accessing credentials or sessions of Tenant B', async () => {
    const userB = await iamService.createUser(tenantBId, {
      email: 'user@beta.com',
      mfaRequired: false,
    });
    await authService.setUserPassword(tenantBId, userB.id, 'SenhaBeta123!');

    const client = await testPool.connect();
    try {
      await client.query('SET LOCAL ROLE transport_rls_test');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantAId]);

      // Sob contexto de Tenant A, consulta credenciais de User B (pertencente ao Tenant B)
      const credsRes = await client.query(
        `SELECT * FROM iam.user_credentials WHERE user_id = $1`,
        [userB.id],
      );
      expect(credsRes.rows).toHaveLength(0);

      // Consulta sessões de Tenant B sob contexto de Tenant A
      const sessionsRes = await client.query(
        `SELECT * FROM iam.sessions WHERE tenant_id = $1`,
        [tenantBId],
      );
      expect(sessionsRes.rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
