import * as path from 'node:path';
import { Pool } from 'pg';
import { MigrationRunner } from '../src/tooling/migration-runner';
import { PostgresOutboxRepository } from '../src/modules/outbox/infrastructure/postgres-outbox.repository';
import { PostgresTenantRepository } from '../src/modules/platform/infrastructure/postgres-tenant.repository';
import { TenantManagementService } from '../src/modules/platform/application/tenant-management.service';

const baseConnectionString =
  process.env.TEST_DATABASE_URL ??
  'postgresql://transport:transport@127.0.0.1:5432/transport';

function getDbUrlForDatabase(dbName: string): string {
  const url = new URL(baseConnectionString);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('Tenant Lifecycle PostgreSQL Integration', () => {
  const adminPool = new Pool({ connectionString: baseConnectionString });
  const realMigrationsDir = path.resolve(__dirname, '../../../infrastructure/migrations');

  const testDbName = `test_tenant_lifecycle_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let testPool: Pool;
  let tenantService: TenantManagementService;
  let tenantRepository: PostgresTenantRepository;
  let outboxRepository: PostgresOutboxRepository;

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${testDbName}`);
    testPool = new Pool({ connectionString: getDbUrlForDatabase(testDbName) });

    // Aplica todas as migrations (0001 e 0002) no banco limpo
    const runner = new MigrationRunner(testPool, {
      log: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    });
    await runner.run(realMigrationsDir);

    // Cria a role de teste RLS se não existir
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

    tenantRepository = new PostgresTenantRepository();
    outboxRepository = new PostgresOutboxRepository();
    tenantService = new TenantManagementService(testPool, tenantRepository, outboxRepository);
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

  it('provisions a new tenant with outbox event and audit record in a single transaction', async () => {
    const result = await tenantService.provisionTenant({
      slug: 'viacao-cometa',
      legalName: 'Viação Cometa S/A',
      commercialName: 'Cometa',
    });

    expect(result.id).toBeDefined();
    expect(result.status).toBe('PROVISIONED');

    // Confirma persistência do tenant
    const tenantRes = await testPool.query<{ legal_name: string; commercial_name: string; status: string }>(
      'SELECT legal_name, commercial_name, status FROM platform.tenants WHERE id = $1',
      [result.id],
    );
    expect(tenantRes.rows).toHaveLength(1);
    expect(tenantRes.rows[0].legal_name).toBe('Viação Cometa S/A');
    expect(tenantRes.rows[0].commercial_name).toBe('Cometa');
    expect(tenantRes.rows[0].status).toBe('PROVISIONED');

    // Confirma gravação no Transactional Outbox
    const outboxRes = await testPool.query<{ event_type: string; payload: any }>(
      'SELECT event_type, payload FROM integration.outbox_events WHERE tenant_id = $1',
      [result.id],
    );
    expect(outboxRes.rows).toHaveLength(1);
    expect(outboxRes.rows[0].event_type).toBe('TenantProvisioned');
    expect(outboxRes.rows[0].payload.slug).toBe('viacao-cometa');

    // Confirma evidência de Auditoria
    const auditRes = await testPool.query<{ action: string; resource_type: string }>(
      'SELECT action, resource_type FROM audit.audit_records WHERE tenant_id = $1',
      [result.id],
    );
    expect(auditRes.rows).toHaveLength(1);
    expect(auditRes.rows[0].action).toBe('TENANT_PROVISIONED');
    expect(auditRes.rows[0].resource_type).toBe('Tenant');
  });

  it('activates and suspends a tenant generating sequential outbox events and audit records', async () => {
    const tenant = await tenantService.provisionTenant({
      slug: 'express-sul',
      legalName: 'Express Sul Transportes',
    });

    // 1. Ativação
    const activated = await tenantService.activateTenant(tenant.id, 'admin-123');
    expect(activated.status).toBe('ACTIVE');
    expect(activated.version).toBe(2);

    // 2. Suspensão
    const suspended = await tenantService.suspendTenant(tenant.id, 'Inadimplência de fatura', 'admin-123');
    expect(suspended.status).toBe('SUSPENDED');
    expect(suspended.version).toBe(3);

    // Confirma eventos de outbox sequenciais
    const events = await testPool.query<{ event_type: string; aggregate_version: number }>(
      'SELECT event_type, aggregate_version FROM integration.outbox_events WHERE tenant_id = $1 ORDER BY aggregate_version ASC',
      [tenant.id],
    );
    const eventTypes = events.rows.map((r) => r.event_type);
    expect(eventTypes).toEqual(['TenantProvisioned', 'TenantActivated', 'TenantSuspended']);

    // Confirma registros de auditoria
    const auditRecords = await testPool.query<{ action: string }>(
      'SELECT action FROM audit.audit_records WHERE tenant_id = $1 ORDER BY occurred_at ASC, id ASC',
      [tenant.id],
    );
    const actions = auditRecords.rows.map((r) => r.action);
    expect(actions).toEqual(['TENANT_PROVISIONED', 'TENANT_ACTIVATED', 'TENANT_SUSPENDED']);
  });

  it('enforces RLS isolation on tenant_settings between different tenants', async () => {
    const tenantA = await tenantService.provisionTenant({
      slug: 'tenant-setting-a',
      legalName: 'Tenant Setting A',
    });
    const tenantB = await tenantService.provisionTenant({
      slug: 'tenant-setting-b',
      legalName: 'Tenant Setting B',
    });

    await tenantService.setSetting(tenantA.id, 'notifications.email', { enabled: true });
    await tenantService.setSetting(tenantB.id, 'notifications.email', { enabled: false });

    const clientA = await testPool.connect();
    try {
      await clientA.query('BEGIN');
      await clientA.query('SET LOCAL ROLE transport_rls_test');
      await clientA.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA.id]);

      const resA = await clientA.query<{ setting_value: any }>(
        'SELECT setting_value FROM platform.tenant_settings WHERE setting_key = $1',
        ['notifications.email'],
      );
      expect(resA.rows).toHaveLength(1);
      expect(resA.rows[0].setting_value).toEqual({ enabled: true });

      // Garante que Tenant A não vê os dados de Tenant B
      const crossRes = await clientA.query(
        'SELECT 1 FROM platform.tenant_settings WHERE tenant_id = $1',
        [tenantB.id],
      );
      expect(crossRes.rows).toHaveLength(0);

      await clientA.query('COMMIT');
    } finally {
      clientA.release();
    }
  });
});

