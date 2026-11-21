import * as path from 'node:path';
import { Pool } from 'pg';
import { MigrationRunner } from '../src/tooling/migration-runner';
import { PostgresOutboxRepository } from '../src/modules/outbox/infrastructure/postgres-outbox.repository';
import { PostgresTenantRepository } from '../src/modules/platform/infrastructure/postgres-tenant.repository';
import { TenantManagementService } from '../src/modules/platform/application/tenant-management.service';
import { PostgresClientCompanyRepository } from '../src/modules/clients/infrastructure/postgres-client-company.repository';
import { ClientCompanyManagementService } from '../src/modules/clients/application/client-company-management.service';
import { PostgresLocationRepository } from '../src/modules/locations/infrastructure/postgres-location.repository';
import {
  LocationManagementService,
  ClientCompanyNotBelongingError,
} from '../src/modules/locations/application/location-management.service';
import type { GeoPoint } from '../src/modules/locations/domain/location.types';

const baseConnectionString =
  process.env.TEST_DATABASE_URL ??
  'postgresql://transport:transport@127.0.0.1:5432/transport';

function getDbUrlForDatabase(dbName: string): string {
  const url = new URL(baseConnectionString);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('Service Locations & Geofences PostgreSQL PostGIS Integration', () => {
  const adminPool = new Pool({ connectionString: baseConnectionString });
  const realMigrationsDir = path.resolve(__dirname, '../../../infrastructure/migrations');

  const testDbName = `test_loc_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let testPool: Pool;
  let tenantService: TenantManagementService;
  let clientCompanyService: ClientCompanyManagementService;
  let locationService: LocationManagementService;

  let tenantAId: string;
  let tenantBId: string;
  let companyAId: string;

  // Centro de SP: Marco Zero (-23.55052, -46.633308)
  const sePoint: GeoPoint = { latitude: -23.55052, longitude: -46.633308 };

  const validAddress = {
    street: 'Praça da Sé',
    number: '100',
    neighborhood: 'Sé',
    city: 'São Paulo',
    state: 'SP',
    postalCode: '01001-000',
  };

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
      GRANT USAGE ON SCHEMA platform, iam, crm, workforce, fleet, service, audit, integration TO transport_rls_test;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform, iam, crm, workforce, fleet, service, audit, integration TO transport_rls_test;
      GRANT transport_rls_test TO CURRENT_USER;
    `);

    const tenantRepo = new PostgresTenantRepository();
    const outboxRepo = new PostgresOutboxRepository();
    tenantService = new TenantManagementService(testPool, tenantRepo, outboxRepo);

    const clientCompanyRepo = new PostgresClientCompanyRepository(testPool);
    clientCompanyService = new ClientCompanyManagementService(testPool, clientCompanyRepo, outboxRepo);

    const locationRepo = new PostgresLocationRepository(testPool);
    locationService = new LocationManagementService(testPool, locationRepo, clientCompanyRepo, outboxRepo);

    // Setup tenants
    const tenantA = await tenantService.createTenant({
      name: 'Logistics Alpha',
      slug: `alpha-${Date.now()}`,
    });
    tenantAId = tenantA.id;

    const tenantB = await tenantService.createTenant({
      name: 'Logistics Beta',
      slug: `beta-${Date.now()}`,
    });
    tenantBId = tenantB.id;

    // Setup client company in tenant A
    const company = await clientCompanyService.create(tenantAId, {
      legalName: 'Cliente Industrial Alpha SA',
      commercialName: 'Industrial Alpha',
      taxId: '33.000.167/0001-01',
    });
    companyAId = company.id;
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

  it('creates location with PostGIS geography point and enforces company tenant boundary', async () => {
    // 1. Criação válida em Tenant A associada à empresa do Tenant A
    const location = await locationService.create(tenantAId, {
      clientCompanyId: companyAId,
      name: 'Unidade Fabril Principal',
      locationType: 'CLIENT_SITE',
      addressStructured: validAddress,
      point: sePoint,
      geofenceRadiusMeters: 300,
    });

    expect(location.id).toBeDefined();
    expect(location.name).toBe('Unidade Fabril Principal');
    expect(location.point).toEqual(sePoint);
    expect(location.geofenceRadiusMeters).toBe(300);

    // 2. Tentativa de associar empresa de Tenant A em Tenant B deve falhar
    await expect(
      locationService.create(tenantBId, {
        clientCompanyId: companyAId, // Empresa pertence a Tenant A!
        name: 'Tentativa Invasão',
        addressStructured: validAddress,
        point: sePoint,
      }),
    ).rejects.toThrow(ClientCompanyNotBelongingError);
  });

  it('supports polygonal geofence and evaluates spatial point containment', async () => {
    const squareGeofence: GeoPoint[] = [
      { latitude: -23.550, longitude: -46.634 },
      { latitude: -23.550, longitude: -46.632 },
      { latitude: -23.552, longitude: -46.632 },
      { latitude: -23.552, longitude: -46.634 },
      { latitude: -23.550, longitude: -46.634 },
    ];

    const loc = await locationService.create(tenantAId, {
      name: 'Terminal Rodoviário Central',
      locationType: 'STOP_POINT',
      addressStructured: validAddress,
      point: sePoint,
      geofence: squareGeofence,
    });

    expect(loc.geofence).toBeDefined();
    expect(loc.geofence?.length).toBe(5);

    // Avaliação: ponto interno
    const insideResult = await locationService.evaluatePointContainment(tenantAId, loc.id, {
      latitude: -23.551,
      longitude: -46.633,
    });
    expect(insideResult.isInside).toBe(true);

    // Avaliação: ponto externo
    const outsideResult = await locationService.evaluatePointContainment(tenantAId, loc.id, {
      latitude: -23.560,
      longitude: -46.640,
    });
    expect(outsideResult.isInside).toBe(false);
  });

  it('queries nearby locations within radius meters via PostGIS ST_DWithin', async () => {
    const nearbyLocations = await locationService.findNearby(tenantAId, sePoint, 1000);
    expect(nearbyLocations.length).toBeGreaterThanOrEqual(1);

    // Raio muito restrito (1 metro)
    const noneNearby = await locationService.findNearby(tenantAId, { latitude: -20.0, longitude: -40.0 }, 10);
    expect(noneNearby).toHaveLength(0);
  });

  it('emits transactional outbox event and records immutable audit', async () => {
    const loc = await locationService.create(tenantAId, {
      name: 'Base Operacional Sul',
      locationType: 'OPERATIONAL_BASE',
      addressStructured: validAddress,
      point: { latitude: -23.600, longitude: -46.650 },
      geofenceRadiusMeters: 500,
    });

    // Check Outbox
    const outboxRes = await testPool.query<{ event_type: string }>(
      `SELECT event_type FROM platform.outbox_events WHERE aggregate_id = $1 AND event_type = 'LocationCreated'`,
      [loc.id],
    );
    expect(outboxRes.rows).toHaveLength(1);

    // Check Audit
    const auditRes = await testPool.query<{ action: string; resource_type: string }>(
      `SELECT action, resource_type FROM audit.audit_records WHERE resource_id = $1`,
      [loc.id],
    );
    expect(auditRes.rows).toHaveLength(1);
    expect(auditRes.rows[0].action).toBe('LOCATION_CREATED');
    expect(auditRes.rows[0].resource_type).toBe('ServiceLocation');
  });
});
