import * as path from 'node:path';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { MigrationRunner } from '../src/tooling/migration-runner';
import { PostgresOutboxRepository } from '../src/modules/outbox/infrastructure/postgres-outbox.repository';
import { PostgresTenantRepository } from '../src/modules/platform/infrastructure/postgres-tenant.repository';
import { TenantManagementService } from '../src/modules/platform/application/tenant-management.service';
import {
  PostgresPlanRepository,
  PostgresSubscriptionRepository,
} from '../src/modules/platform/infrastructure/postgres-subscription.repository';
import { EntitlementService } from '../src/modules/platform/application/entitlement.service';
import { SubscriptionManagementService } from '../src/modules/platform/application/subscription-management.service';

const baseConnectionString =
  process.env.TEST_DATABASE_URL ??
  'postgresql://transport:transport@127.0.0.1:5432/transport';

function getDbUrlForDatabase(dbName: string): string {
  const url = new URL(baseConnectionString);
  url.pathname = `/${dbName}`;
  return url.toString();
}

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

describe('Plans & Entitlements PostgreSQL Integration', () => {
  const adminPool = new Pool({ connectionString: baseConnectionString });
  const realMigrationsDir = path.resolve(__dirname, '../../../infrastructure/migrations');

  const testDbName = `test_plans_entitlements_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let testPool: Pool;
  let tenantService: TenantManagementService;
  let planRepo: PostgresPlanRepository;
  let subscriptionRepo: PostgresSubscriptionRepository;
  let entitlementService: EntitlementService;
  let subscriptionService: SubscriptionManagementService;
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

    const tenantRepo = new PostgresTenantRepository();
    const outboxRepo = new PostgresOutboxRepository();
    tenantService = new TenantManagementService(testPool, tenantRepo, outboxRepo);

    planRepo = new PostgresPlanRepository();
    subscriptionRepo = new PostgresSubscriptionRepository();
    entitlementService = new EntitlementService(
      testPool,
      redisClient as unknown as Redis,
      planRepo,
      subscriptionRepo,
    );
    subscriptionService = new SubscriptionManagementService(
      testPool,
      planRepo,
      subscriptionRepo,
      entitlementService,
      outboxRepo,
    );

    const tA = await tenantService.provisionTenant({
      slug: 'plan-alfa',
      legalName: 'Alfa Transportes Ltda',
    });
    tenantAId = tA.id;
    await tenantService.activateTenant(tenantAId);

    const tB = await tenantService.provisionTenant({
      slug: 'plan-beta',
      legalName: 'Beta Logística Ltda',
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

  it('loads base plan seeds (STARTER, PROFESSIONAL, ENTERPRISE) from migration 0005', async () => {
    const client = await testPool.connect();
    try {
      const plans = await planRepo.listActive(client);
      expect(plans.length).toBeGreaterThanOrEqual(3);

      const codes = plans.map((p) => p.code);
      expect(codes).toContain('STARTER');
      expect(codes).toContain('PROFESSIONAL');
      expect(codes).toContain('ENTERPRISE');

      const starter = await planRepo.findByCode(client, 'STARTER');
      expect(starter?.getFeature('max_vehicles')).toEqual({ enabled: true, max: 5 });
      expect(starter?.getFeature('realtime_tracking')).toEqual({ enabled: false });

      const pro = await planRepo.findByCode(client, 'PROFESSIONAL');
      expect(pro?.getFeature('max_vehicles')).toEqual({ enabled: true, max: 25 });
      expect(pro?.getFeature('realtime_tracking')).toEqual({ enabled: true });
    } finally {
      client.release();
    }
  });

  it('provisions STARTER plan subscription and resolves entitlements correctly', async () => {
    // Cancela eventual backfill para testar provisionamento explícito
    const client = await testPool.connect();
    try {
      await client.query(`DELETE FROM platform.subscriptions WHERE tenant_id = $1`, [tenantAId]);
    } finally {
      client.release();
    }

    const sub = await subscriptionService.provisionSubscription(tenantAId, {
      planCode: 'STARTER',
    });

    expect(sub.tenantId).toBe(tenantAId);
    expect(sub.planCode).toBe('STARTER');
    expect(sub.status).toBe('ACTIVE');

    const entitlements = await entitlementService.resolveEntitlements(tenantAId);
    expect(entitlements.hasActiveSubscription).toBe(true);
    expect(entitlements.planCode).toBe('STARTER');
    expect(entitlements.features['max_vehicles'].max).toBe(5);

    const hasRealtime = await entitlementService.hasFeature(tenantAId, 'realtime_tracking');
    expect(hasRealtime).toBe(false);

    const limitCheck = await entitlementService.checkLimit(tenantAId, 'max_vehicles', 3);
    expect(limitCheck.allowed).toBe(true);
    expect(limitCheck.max).toBe(5);

    const limitExceededCheck = await entitlementService.checkLimit(tenantAId, 'max_vehicles', 5);
    expect(limitExceededCheck.allowed).toBe(false);
  });

  it('applies custom limits overlay and invalidates cache', async () => {
    await subscriptionService.updateCustomLimits(tenantAId, {
      max_vehicles: { enabled: true, max: 8 },
      realtime_tracking: { enabled: true },
    });

    const entitlements = await entitlementService.resolveEntitlements(tenantAId);
    expect(entitlements.features['max_vehicles'].max).toBe(8);

    const hasRealtime = await entitlementService.hasFeature(tenantAId, 'realtime_tracking');
    expect(hasRealtime).toBe(true);
  });

  it('upgrades subscription plan from STARTER to ENTERPRISE and records Outbox event', async () => {
    const upgraded = await subscriptionService.changePlan(tenantAId, 'ENTERPRISE');
    expect(upgraded.planCode).toBe('ENTERPRISE');

    const outboxRes = await testPool.query(
      `SELECT event_type, payload FROM platform.outbox_events
       WHERE tenant_id = $1 AND event_type = 'PlanChanged'
       ORDER BY aggregate_version DESC LIMIT 1`,
      [tenantAId],
    );
    expect(outboxRes.rows).toHaveLength(1);
    expect(outboxRes.rows[0].payload.newPlanCode).toBe('ENTERPRISE');
  });

  it('enforces RLS isolation preventing Tenant A from accessing subscription of Tenant B', async () => {
    const client = await testPool.connect();
    try {
      await client.query('SET LOCAL ROLE transport_rls_test');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantAId]);

      const subRes = await client.query(
        `SELECT * FROM platform.subscriptions WHERE tenant_id = $1`,
        [tenantBId],
      );
      expect(subRes.rows).toHaveLength(0);
    } finally {
      client.release();
    }
  });
});
