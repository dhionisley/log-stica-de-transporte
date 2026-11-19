import * as path from 'node:path';
import { Pool } from 'pg';
import { MigrationRunner } from '../src/tooling/migration-runner';
import { PostgresOutboxRepository } from '../src/modules/outbox/infrastructure/postgres-outbox.repository';
import { PostgresTenantRepository } from '../src/modules/platform/infrastructure/postgres-tenant.repository';
import { TenantManagementService } from '../src/modules/platform/application/tenant-management.service';
import { PostgresClientCompanyRepository } from '../src/modules/clients/infrastructure/postgres-client-company.repository';
import { ClientCompanyManagementService } from '../src/modules/clients/application/client-company-management.service';
import { PostgresWorkforceRepository } from '../src/modules/workforce/infrastructure/postgres-workforce.repository';
import {
  WorkforceManagementService,
  PersonDocumentConflictError,
} from '../src/modules/workforce/application/workforce-management.service';

const baseConnectionString =
  process.env.TEST_DATABASE_URL ??
  'postgresql://transport:transport@127.0.0.1:5432/transport';

function getDbUrlForDatabase(dbName: string): string {
  const url = new URL(baseConnectionString);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('Workforce PostgreSQL Integration & Multi-Company Gate', () => {
  const adminPool = new Pool({ connectionString: baseConnectionString });
  const realMigrationsDir = path.resolve(__dirname, '../../../infrastructure/migrations');

  const testDbName = `test_workforce_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let testPool: Pool;
  let tenantService: TenantManagementService;
  let clientCompanyService: ClientCompanyManagementService;
  let workforceRepo: PostgresWorkforceRepository;
  let workforceService: WorkforceManagementService;

  let tenantAId: string;
  let tenantBId: string;
  let company1Id: string;
  let company2Id: string;

  const validCpfA = '529.982.247-25';
  const validCpfB = '111.444.777-35';

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
      GRANT USAGE ON SCHEMA platform, iam, crm, workforce, audit, integration TO transport_rls_test;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform, iam, crm, workforce, audit, integration TO transport_rls_test;
      GRANT transport_rls_test TO CURRENT_USER;
    `);

    const tenantRepo = new PostgresTenantRepository();
    const outboxRepo = new PostgresOutboxRepository();
    tenantService = new TenantManagementService(testPool, tenantRepo, outboxRepo);

    const clientCompanyRepo = new PostgresClientCompanyRepository(testPool);
    clientCompanyService = new ClientCompanyManagementService(testPool, clientCompanyRepo, outboxRepo);

    workforceRepo = new PostgresWorkforceRepository(testPool);
    workforceService = new WorkforceManagementService(testPool, workforceRepo, outboxRepo);

    // Provisiona Tenants
    const tA = await tenantService.provisionTenant({
      slug: `tenant-a-${Date.now()}`,
      legalName: 'Tenant A Transportes Ltda',
    });
    tenantAId = tA.id;

    const tB = await tenantService.provisionTenant({
      slug: `tenant-b-${Date.now()}`,
      legalName: 'Tenant B Logística Ltda',
    });
    tenantBId = tB.id;

    // Cria duas empresas clientes no Tenant A para teste de multi-company
    const comp1 = await clientCompanyService.create(tenantAId, {
      legalName: 'Montadora Alpha S/A',
      commercialName: 'Montadora Alpha',
      taxId: '11.222.333/0001-81',
    });
    company1Id = comp1.id;

    const comp2 = await clientCompanyService.create(tenantAId, {
      legalName: 'Farmacêutica Beta Ltda',
      commercialName: 'Farmacêutica Beta',
      taxId: '22.333.444/0001-92',
    });
    company2Id = comp2.id;
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

  it('creates person and employee in Tenant A with strict RLS isolation from Tenant B', async () => {
    const personA = await workforceService.createPerson(tenantAId, {
      fullName: 'Lucas Fernandes',
      preferredName: 'Lucas',
      documentRef: validCpfA,
      email: 'lucas@exemplo.com',
    });

    expect(personA.id).toBeDefined();
    expect(personA.tenantId).toBe(tenantAId);
    expect(personA.documentRef).toBe('52998224725');

    const employeeA = await workforceService.createEmployee(tenantAId, {
      personId: personA.id,
    });
    expect(employeeA.id).toBeDefined();
    expect(employeeA.tenantId).toBe(tenantAId);
    expect(employeeA.status).toBe('ACTIVE');

    // Consulta sob Tenant A
    const foundPerson = await workforceService.findPersonById(tenantAId, personA.id);
    expect(foundPerson.id).toBe(personA.id);

    // Consulta sob Tenant B falha via RLS
    await expect(workforceService.findPersonById(tenantBId, personA.id)).rejects.toThrow(
      'Person not found',
    );
    await expect(workforceService.findEmployeeById(tenantBId, employeeA.id)).rejects.toThrow(
      'Employee not found',
    );
  });

  it('enforces CPF uniqueness within same tenant but allows same CPF across different tenants', async () => {
    // Mesma pessoa no Tenant A -> Conflito
    await expect(
      workforceService.createPerson(tenantAId, {
        fullName: 'Lucas Clone',
        documentRef: validCpfA,
      }),
    ).rejects.toThrow(PersonDocumentConflictError);

    // Mesma pessoa no Tenant B -> Permitido no SaaS multitenant
    const personB = await workforceService.createPerson(tenantBId, {
      fullName: 'Lucas no Tenant B',
      documentRef: validCpfA,
    });
    expect(personB.id).toBeDefined();
    expect(personB.tenantId).toBe(tenantBId);
  });

  it('supports employee with multiple company employments without data leakage between companies', async () => {
    // 1. Cadastra colaborador
    const person = await workforceService.createPerson(tenantAId, {
      fullName: 'Ana Paula Souza',
      documentRef: validCpfB,
    });
    const employee = await workforceService.createEmployee(tenantAId, {
      personId: person.id,
    });

    // 2. Cria vínculo com Empresa Cliente 1
    const emp1 = await workforceService.createEmployment(tenantAId, {
      employeeId: employee.id,
      clientCompanyId: company1Id,
      externalEmployeeCode: 'ALPHA-001',
      validFrom: '2026-01-01T00:00:00Z',
    });
    expect(emp1.id).toBeDefined();
    expect(emp1.clientCompanyId).toBe(company1Id);

    // 3. Cria vínculo com Empresa Cliente 2
    const emp2 = await workforceService.createEmployment(tenantAId, {
      employeeId: employee.id,
      clientCompanyId: company2Id,
      externalEmployeeCode: 'BETA-999',
      validFrom: '2026-06-01T00:00:00Z',
    });
    expect(emp2.id).toBeDefined();
    expect(emp2.clientCompanyId).toBe(company2Id);

    // 4. GATE: listagem da Empresa 1 deve retornar APENAS o vínculo da Empresa 1
    const listCompany1 = await workforceService.listEmploymentsByCompany(tenantAId, company1Id);
    expect(listCompany1).toHaveLength(1);
    expect(listCompany1[0].id).toBe(emp1.id);
    expect(listCompany1[0].externalEmployeeCode).toBe('ALPHA-001');
    expect(listCompany1.find((e) => e.clientCompanyId === company2Id)).toBeUndefined();

    // 5. GATE: listagem da Empresa 2 deve retornar APENAS o vínculo da Empresa 2
    const listCompany2 = await workforceService.listEmploymentsByCompany(tenantAId, company2Id);
    expect(listCompany2).toHaveLength(1);
    expect(listCompany2[0].id).toBe(emp2.id);
    expect(listCompany2[0].externalEmployeeCode).toBe('BETA-999');
    expect(listCompany2.find((e) => e.clientCompanyId === company1Id)).toBeUndefined();
  });

  it('handles provisional authorizations with temporal lifecycle, outbox and audit records', async () => {
    const person = await workforceService.createPerson(tenantAId, {
      fullName: 'Roberto Silva',
      documentRef: '222.333.444-55',
    });
    const employee = await workforceService.createEmployee(tenantAId, {
      personId: person.id,
    });

    const auth = await workforceService.createProvisionalAuthorization(tenantAId, {
      employeeId: employee.id,
      clientCompanyId: company1Id,
      validFrom: '2026-11-01T00:00:00Z',
      validTo: '2026-11-30T23:59:59Z',
      completedReason: 'Período probatório',
    });

    expect(auth.id).toBeDefined();
    expect(auth.status).toBe('ACTIVE');

    const revoked = await workforceService.revokeProvisionalAuthorization(
      tenantAId,
      auth.id,
      'Contrato cancelado',
    );
    expect(revoked.status).toBe('REVOKED');

    // Confirma publicação no Outbox
    const outboxRes = await testPool.query<{ count: string }>(
      `SELECT count(*)::text as count FROM integration.outbox_events
       WHERE tenant_id = $1 AND aggregate_id = $2 AND event_type = 'ProvisionalAuthorizationRevoked'`,
      [tenantAId, auth.id],
    );
    expect(Number.parseInt(outboxRes.rows[0].count, 10)).toBeGreaterThanOrEqual(1);

    // Confirma registro de Auditoria
    const auditRes = await testPool.query<{ count: string }>(
      `SELECT count(*)::text as count FROM audit.audit_records
       WHERE tenant_id = $1 AND resource_id = $2 AND action = 'PROVISIONAL_AUTH_REVOKED'`,
      [tenantAId, auth.id],
    );
    expect(Number.parseInt(auditRes.rows[0].count, 10)).toBeGreaterThanOrEqual(1);
  });
});
