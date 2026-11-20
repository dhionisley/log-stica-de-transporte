import * as path from 'node:path';
import { Pool } from 'pg';
import { MigrationRunner } from '../src/tooling/migration-runner';
import { PostgresOutboxRepository } from '../src/modules/outbox/infrastructure/postgres-outbox.repository';
import { PostgresTenantRepository } from '../src/modules/platform/infrastructure/postgres-tenant.repository';
import { TenantManagementService } from '../src/modules/platform/application/tenant-management.service';
import { PostgresWorkforceRepository } from '../src/modules/workforce/infrastructure/postgres-workforce.repository';
import { WorkforceManagementService } from '../src/modules/workforce/application/workforce-management.service';
import { PostgresVehicleRepository } from '../src/modules/fleet/infrastructure/postgres-vehicle.repository';
import {
  VehicleManagementService,
  VehiclePlateConflictError,
  VehicleFleetCodeConflictError,
} from '../src/modules/fleet/application/vehicle-management.service';

const baseConnectionString =
  process.env.TEST_DATABASE_URL ??
  'postgresql://transport:transport@127.0.0.1:5432/transport';

function getDbUrlForDatabase(dbName: string): string {
  const url = new URL(baseConnectionString);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('Fleet & Driver Eligibility PostgreSQL Integration', () => {
  const adminPool = new Pool({ connectionString: baseConnectionString });
  const realMigrationsDir = path.resolve(__dirname, '../../../infrastructure/migrations');

  const testDbName = `test_fleet_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let testPool: Pool;
  let tenantService: TenantManagementService;
  let workforceService: WorkforceManagementService;
  let vehicleService: VehicleManagementService;

  let tenantAId: string;
  let tenantBId: string;
  let personDriverAId: string;

  const validCpfDriver = '529.982.247-25';

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
      GRANT USAGE ON SCHEMA platform, iam, crm, workforce, fleet, audit, integration TO transport_rls_test;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform, iam, crm, workforce, fleet, audit, integration TO transport_rls_test;
      GRANT transport_rls_test TO CURRENT_USER;
    `);

    const tenantRepo = new PostgresTenantRepository();
    const outboxRepo = new PostgresOutboxRepository();
    tenantService = new TenantManagementService(testPool, tenantRepo, outboxRepo);

    const workforceRepo = new PostgresWorkforceRepository(testPool);
    workforceService = new WorkforceManagementService(testPool, workforceRepo, outboxRepo);

    const vehicleRepo = new PostgresVehicleRepository(testPool);
    vehicleService = new VehicleManagementService(testPool, vehicleRepo, workforceRepo, outboxRepo);

    // Setup tenants
    const tenantA = await tenantService.createTenant({
      name: 'Fleet Logistics A',
      slug: `fleet-a-${Date.now()}`,
    });
    tenantAId = tenantA.id;

    const tenantB = await tenantService.createTenant({
      name: 'Fleet Logistics B',
      slug: `fleet-b-${Date.now()}`,
    });
    tenantBId = tenantB.id;

    // Setup base person for driver
    const personDriver = await workforceService.createPerson(tenantAId, {
      fullName: 'Carlos Motorista Oficial',
      documentRef: validCpfDriver,
    });
    personDriverAId = personDriver.id;
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

  it('creates vehicle and enforces plate uniqueness per tenant', async () => {
    const vehicleA = await vehicleService.create(tenantAId, {
      fleetCode: 'BUS-101',
      plate: 'ABC-1234',
      category: 'BUS',
      capacity: 44,
      accessibilityFeatures: ['WHEELCHAIR_LIFT'],
    });

    expect(vehicleA.id).toBeDefined();
    expect(vehicleA.plateNormalized).toBe('ABC1234');
    expect(vehicleA.operationalStatus).toBe('AVAILABLE');

    // Duplicate plate in the same tenant must fail
    await expect(
      vehicleService.create(tenantAId, {
        fleetCode: 'BUS-102',
        plate: 'ABC1234',
        capacity: 40,
      }),
    ).rejects.toThrow(VehiclePlateConflictError);

    // Duplicate fleet code in the same tenant must fail
    await expect(
      vehicleService.create(tenantAId, {
        fleetCode: 'BUS-101',
        plate: 'XYZ9876',
        capacity: 40,
      }),
    ).rejects.toThrow(VehicleFleetCodeConflictError);

    // Same plate in a DIFFERENT tenant must succeed (tenant isolation)
    const vehicleB = await vehicleService.create(tenantBId, {
      fleetCode: 'BUS-101',
      plate: 'ABC-1234',
      category: 'BUS',
      capacity: 44,
    });
    expect(vehicleB.id).toBeDefined();
    expect(vehicleB.tenantId).toBe(tenantBId);
  });

  it('attaches documents to vehicle and tracks outbox event', async () => {
    const vehicle = await vehicleService.create(tenantAId, {
      fleetCode: 'VAN-201',
      plate: 'BRA2E19',
      category: 'VAN',
      capacity: 15,
    });

    const doc = await vehicleService.attachDocument(tenantAId, vehicle.id, {
      documentType: 'CRLV',
      documentNumber: 'CRLV-2026-999',
      expiresAt: new Date(Date.now() + 86400000 * 365).toISOString(),
    });

    expect(doc.id).toBeDefined();
    expect(doc.status).toBe('VALID');

    // Outbox event check
    const outboxRes = await testPool.query<{ event_type: string }>(
      `SELECT event_type FROM platform.outbox_events WHERE aggregate_id = $1 AND event_type = 'VehicleDocumentAttached'`,
      [vehicle.id],
    );
    expect(outboxRes.rows).toHaveLength(1);
  });

  it('qualifies a driver, attaches documents, and validates eligibility gate', async () => {
    const futureExpiry = new Date(Date.now() + 86400000 * 180);
    const pastExpiry = new Date(Date.now() - 86400000 * 30);

    // 1. Create a qualified driver with Category D
    const driver = await workforceService.createDriver(tenantAId, {
      personId: personDriverAId,
      licenseNumber: '99887766554',
      licenseCategory: 'D',
      licenseExpiresAt: futureExpiry,
    });

    expect(driver.id).toBeDefined();
    expect(driver.status).toBe('ACTIVE');

    // 2. Create vehicle in maintenance
    const busInMaintenance = await vehicleService.create(tenantAId, {
      fleetCode: 'BUS-999',
      plate: 'MNT1A23',
      category: 'BUS',
      capacity: 44,
    });
    await vehicleService.changeOperationalStatus(tenantAId, busInMaintenance.id, 'IN_MAINTENANCE', 'Revisão periódica');

    // Gate check: Vehicle in maintenance must be blocked
    const maintenanceResult = await vehicleService.evaluateEligibility(
      tenantAId,
      busInMaintenance.id,
      driver.id,
    );
    expect(maintenanceResult.isEligible).toBe(false);
    expect(maintenanceResult.reasons).toContain('VEHICLE_NOT_AVAILABLE:IN_MAINTENANCE');

    // 3. Create active available bus
    const activeBus = await vehicleService.create(tenantAId, {
      fleetCode: 'BUS-050',
      plate: 'OKY9B88',
      category: 'BUS',
      capacity: 44,
    });

    // Gate check: Fully compliant driver and bus -> ELIGIBLE
    const okResult = await vehicleService.evaluateEligibility(
      tenantAId,
      activeBus.id,
      driver.id,
    );
    expect(okResult.isEligible).toBe(true);
    expect(okResult.reasons).toHaveLength(0);

    // 4. Update driver license to expired date
    await workforceService.updateDriver(tenantAId, driver.id, {
      licenseExpiresAt: pastExpiry,
    });

    // Gate check: Expired CNH must be blocked
    const expiredResult = await vehicleService.evaluateEligibility(
      tenantAId,
      activeBus.id,
      driver.id,
    );
    expect(expiredResult.isEligible).toBe(false);
    expect(expiredResult.reasons).toContain('DRIVER_LICENSE_EXPIRED');

    // 5. Suspend driver
    await workforceService.suspendDriver(tenantAId, driver.id, {
      reason: 'CNH suspensa pelo Detran',
    });

    const suspendedResult = await vehicleService.evaluateEligibility(
      tenantAId,
      activeBus.id,
      driver.id,
    );
    expect(suspendedResult.isEligible).toBe(false);
    expect(suspendedResult.reasons).toContain('DRIVER_SUSPENDED');

    // Verify eligibility history was recorded in database
    const historyRes = await workforceService.listDriverEligibilities(tenantAId, driver.id);
    expect(historyRes.length).toBeGreaterThanOrEqual(1);
  });
});
