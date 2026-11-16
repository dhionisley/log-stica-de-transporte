import * as path from 'node:path';
import { Pool } from 'pg';
import { MigrationRunner } from '../src/tooling/migration-runner';
import { PostgresOutboxRepository } from '../src/modules/outbox/infrastructure/postgres-outbox.repository';
import { PostgresTenantRepository } from '../src/modules/platform/infrastructure/postgres-tenant.repository';
import { TenantManagementService } from '../src/modules/platform/application/tenant-management.service';
import {
  PostgresUserRepository,
  PostgresPermissionProfileRepository,
  PostgresUserProfileAssignmentRepository,
  PostgresPermissionCatalogRepository,
} from '../src/modules/iam/infrastructure/postgres-iam.repository';
import {
  IamManagementService,
  UserEmailConflictError,
  InvalidPermissionCodeError,
} from '../src/modules/iam/application/iam-management.service';
import { AuthorizationService } from '../src/modules/iam/application/authorization.service';

const baseConnectionString =
  process.env.TEST_DATABASE_URL ??
  'postgresql://transport:transport@127.0.0.1:5432/transport';

function getDbUrlForDatabase(dbName: string): string {
  const url = new URL(baseConnectionString);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('IAM & RBAC PostgreSQL Integration', () => {
  const adminPool = new Pool({ connectionString: baseConnectionString });
  const realMigrationsDir = path.resolve(__dirname, '../../../infrastructure/migrations');

  const testDbName = `test_iam_rbac_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let testPool: Pool;
  let tenantService: TenantManagementService;
  let iamService: IamManagementService;
  let authService: AuthorizationService;

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

    const tenantRepo = new PostgresTenantRepository();
    const outboxRepo = new PostgresOutboxRepository();
    tenantService = new TenantManagementService(testPool, tenantRepo, outboxRepo);

    const userRepo = new PostgresUserRepository();
    const profileRepo = new PostgresPermissionProfileRepository();
    const assignmentRepo = new PostgresUserProfileAssignmentRepository();
    const catalogRepo = new PostgresPermissionCatalogRepository();

    iamService = new IamManagementService(
      testPool,
      userRepo,
      profileRepo,
      assignmentRepo,
      catalogRepo,
      outboxRepo,
    );
    authService = new AuthorizationService(testPool);

    // Cria Tenant A e Tenant B
    const tA = await tenantService.provisionTenant({
      slug: 'empresa-alfa',
      legalName: 'Alfa Transportes Ltda',
    });
    tenantAId = tA.id;

    const tB = await tenantService.provisionTenant({
      slug: 'empresa-beta',
      legalName: 'Beta Logistica Ltda',
    });
    tenantBId = tB.id;
  });

  afterAll(async () => {
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

  it('provisions a user, emits UserCreated in outbox, and logs audit', async () => {
    const user = await iamService.createUser(
      tenantAId,
      {
        email: 'gestor@alfa.com',
        phoneNormalized: '+5511988887777',
        mfaRequired: true,
      },
      'admin-actor',
    );

    expect(user.id).toBeDefined();
    expect(user.emailNormalized).toBe('gestor@alfa.com');
    expect(user.status).toBe('ACTIVE');
    expect(user.mfaRequired).toBe(true);

    // Verifica Outbox
    const outboxRes = await testPool.query<{ event_type: string; payload: { email: string } }>(
      `SELECT event_type, payload FROM integration.outbox_events 
       WHERE tenant_id = $1 AND aggregate_id = $2`,
      [tenantAId, user.id],
    );
    expect(outboxRes.rows).toHaveLength(1);
    expect(outboxRes.rows[0].event_type).toBe('UserCreated');
    expect(outboxRes.rows[0].payload.email).toBe('gestor@alfa.com');

    // Verifica Audit
    const auditRes = await testPool.query<{ action: string; resource_type: string }>(
      `SELECT action, resource_type FROM audit.audit_records 
       WHERE tenant_id = $1 AND resource_id = $2`,
      [tenantAId, user.id],
    );
    expect(auditRes.rows).toHaveLength(1);
    expect(auditRes.rows[0].action).toBe('USER_CREATED');
  });

  it('rejects duplicate email within the same tenant', async () => {
    await expect(
      iamService.createUser(tenantAId, { email: 'gestor@alfa.com' }),
    ).rejects.toThrow(UserEmailConflictError);
  });

  it('allows same email in a different tenant (tenant-scoped isolation)', async () => {
    const userBeta = await iamService.createUser(tenantBId, {
      email: 'gestor@alfa.com',
    });
    expect(userBeta.tenantId).toBe(tenantBId);
  });

  it('creates permission profile and validates global permission codes', async () => {
    // Rejeita permissão inexistente
    await expect(
      iamService.createProfile(tenantAId, {
        name: 'Supervisor',
        permissions: ['invalid:nonexistent:code'],
      }),
    ).rejects.toThrow(InvalidPermissionCodeError);

    // Aceita permissões válidas
    const profile = await iamService.createProfile(tenantAId, {
      name: 'Supervisor Operacional',
      profileType: 'SUPERVISOR',
      permissions: ['tenant:read', 'iam:user:read'],
    });

    expect(profile.id).toBeDefined();
    expect(profile.permissions).toContain('tenant:read');
    expect(profile.permissions).toContain('iam:user:read');

    // Verifica Outbox
    const outboxRes = await testPool.query<{ event_type: string }>(
      `SELECT event_type FROM integration.outbox_events 
       WHERE tenant_id = $1 AND aggregate_id = $2`,
      [tenantAId, profile.id],
    );
    expect(outboxRes.rows).toHaveLength(1);
    expect(outboxRes.rows[0].event_type).toBe('PermissionProfileCreated');
  });

  it('assigns profile to user and resolves contextual permissions correctly', async () => {
    const user = await iamService.createUser(tenantAId, {
      email: 'operador@alfa.com',
    });
    const profile = await iamService.createProfile(tenantAId, {
      name: 'Perfil Operador',
      permissions: ['iam:user:read'],
    });

    // Antes da atribuição: sem permissão
    const hasPermBefore = await authService.hasPermission(
      tenantAId,
      user.id,
      'iam:user:read',
    );
    expect(hasPermBefore).toBe(false);

    // Atribuição de perfil
    await iamService.assignProfileToUser(tenantAId, {
      userId: user.id,
      profileId: profile.id,
    });

    // Depois da atribuição: com permissão
    const hasPermAfter = await authService.hasPermission(
      tenantAId,
      user.id,
      'iam:user:read',
    );
    expect(hasPermAfter).toBe(true);

    const userPerms = await authService.getUserPermissions(tenantAId, user.id);
    expect(userPerms).toEqual(['iam:user:read']);

    // Revogação de perfil
    await iamService.revokeProfileFromUser(tenantAId, user.id, profile.id);

    const hasPermRevoked = await authService.hasPermission(
      tenantAId,
      user.id,
      'iam:user:read',
    );
    expect(hasPermRevoked).toBe(false);
  });

  it('enforces RLS and prevents cross-tenant access and assignment', async () => {
    const userA = await iamService.createUser(tenantAId, {
      email: 'user-a@alfa.com',
    });
    const profileB = await iamService.createProfile(tenantBId, {
      name: 'Perfil Beta',
      permissions: ['tenant:read'],
    });

    // 1. RLS: Sessão de Tenant A não deve listar o perfil de Tenant B
    const clientA = await testPool.connect();
    try {
      await clientA.query(`SET ROLE transport_rls_test;`);
      await clientA.query(`SELECT set_config('app.tenant_id', $1, true);`, [tenantAId]);

      const rlsRes = await clientA.query(
        `SELECT id FROM iam.permission_profiles WHERE id = $1`,
        [profileB.id],
      );
      expect(rlsRes.rows).toHaveLength(0);
    } finally {
      await clientA.query(`RESET ROLE;`);
      clientA.release();
    }

    // 2. Prevenção cross-tenant no nível de banco: associar profileB (Tenant B) ao userA (Tenant A)
    await expect(
      testPool.query(
        `INSERT INTO iam.user_profile_assignments (tenant_id, user_id, profile_id)
         VALUES ($1, $2, $3)`,
        [tenantAId, userA.id, profileB.id],
      ),
    ).rejects.toThrow(/violates foreign key constraint/i);
  });
});

