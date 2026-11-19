import * as path from 'node:path';
import { Pool } from 'pg';
import { MigrationRunner } from '../src/tooling/migration-runner';
import { PostgresOutboxRepository } from '../src/modules/outbox/infrastructure/postgres-outbox.repository';
import { PostgresTenantRepository } from '../src/modules/platform/infrastructure/postgres-tenant.repository';
import { TenantManagementService } from '../src/modules/platform/application/tenant-management.service';
import { PostgresClientCompanyRepository } from '../src/modules/clients/infrastructure/postgres-client-company.repository';
import {
  ClientCompanyManagementService,
  ClientCompanyTaxIdConflictError,
} from '../src/modules/clients/application/client-company-management.service';
import { ClientCompanyDomainError } from '../src/modules/clients/domain/client-company.entity';

const baseConnectionString =
  process.env.TEST_DATABASE_URL ??
  'postgresql://transport:transport@127.0.0.1:5432/transport';

function getDbUrlForDatabase(dbName: string): string {
  const url = new URL(baseConnectionString);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('ClientCompany PostgreSQL Integration', () => {
  const adminPool = new Pool({ connectionString: baseConnectionString });
  const realMigrationsDir = path.resolve(__dirname, '../../../infrastructure/migrations');

  const testDbName = `test_client_companies_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let testPool: Pool;
  let tenantService: TenantManagementService;
  let clientCompanyRepo: PostgresClientCompanyRepository;
  let clientCompanyService: ClientCompanyManagementService;

  let tenantAId: string;
  let tenantBId: string;

  const validCnpjA = '11.222.333/0001-81';
  const validCnpjB = '22.333.444/0001-92';

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
      GRANT USAGE ON SCHEMA platform, iam, crm, audit, integration TO transport_rls_test;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform, iam, crm, audit, integration TO transport_rls_test;
      GRANT transport_rls_test TO CURRENT_USER;
    `);

    const tenantRepo = new PostgresTenantRepository();
    const outboxRepo = new PostgresOutboxRepository();
    tenantService = new TenantManagementService(testPool, tenantRepo, outboxRepo);

    clientCompanyRepo = new PostgresClientCompanyRepository(testPool);
    clientCompanyService = new ClientCompanyManagementService(testPool, clientCompanyRepo, outboxRepo);

    const tA = await tenantService.provisionTenant({
      slug: `tenant-a-${Date.now()}`,
      legalName: 'Tenant A Operações Ltda',
    });
    tenantAId = tA.id;

    const tB = await tenantService.provisionTenant({
      slug: `tenant-b-${Date.now()}`,
      legalName: 'Tenant B Logística Ltda',
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

  it('creates client company in Tenant A and verifies RLS strict isolation from Tenant B', async () => {
    const created = await clientCompanyService.create(tenantAId, {
      legalName: 'Indústria Metalúrgica Alpha S/A',
      commercialName: 'Metalúrgica Alpha',
      taxId: validCnpjA,
      billingAddress: {
        street: 'Rodovia dos Bandeirantes',
        number: 'KM 50',
        neighborhood: 'Industrial',
        city: 'Jundiaí',
        state: 'SP',
        postalCode: '13200-000',
      },
      contacts: [
        {
          name: 'Carlos Oliveira',
          email: 'carlos@alpha.com.br',
          role: 'Gerente de RH',
          isPrimary: true,
        },
      ],
    });

    expect(created.id).toBeDefined();
    expect(created.tenantId).toBe(tenantAId);
    expect(created.taxId).toBe('11222333000181');
    expect(created.status).toBe('ACTIVE');

    // Tenant A consulta e visualiza
    const foundA = await clientCompanyService.findById(tenantAId, created.id);
    expect(foundA.id).toBe(created.id);
    expect(foundA.legalName).toBe('Indústria Metalúrgica Alpha S/A');

    // Tenant B tenta consultar diretamente e deve falhar com NotFoundException via RLS
    await expect(clientCompanyService.findById(tenantBId, created.id)).rejects.toThrow(
      'Client company not found',
    );

    // Listagem sob Tenant B não lista a empresa do Tenant A
    const listB = await clientCompanyService.list(tenantBId);
    expect(listB.items.find((i) => i.id === created.id)).toBeUndefined();
  });

  it('enforces taxId uniqueness within same tenant but allows same taxId in different tenants', async () => {
    // Tenant A tenta recriar com o mesmo CNPJ -> Conflito
    await expect(
      clientCompanyService.create(tenantAId, {
        legalName: 'Alpha Filial SP',
        commercialName: 'Alpha SP',
        taxId: validCnpjA,
      }),
    ).rejects.toThrow(ClientCompanyTaxIdConflictError);

    // Tenant B cadastra com o mesmo CNPJ -> Permitido no SaaS multilocatário
    const companyB = await clientCompanyService.create(tenantBId, {
      legalName: 'Metalúrgica Alpha (Cliente Tenant B)',
      commercialName: 'Alpha B',
      taxId: validCnpjA,
    });

    expect(companyB.id).toBeDefined();
    expect(companyB.tenantId).toBe(tenantBId);
    expect(companyB.taxId).toBe('11222333000181');
  });

  it('updates company and enforces optimistic concurrency control via version', async () => {
    const company = await clientCompanyService.create(tenantAId, {
      legalName: 'Beta Tecnologia Ltda',
      commercialName: 'Beta Tech',
      taxId: validCnpjB,
    });

    expect(company.version).toBe(1);

    const updated = await clientCompanyService.update(tenantAId, company.id, {
      commercialName: 'Beta Global Tech',
    });

    expect(updated.commercialName).toBe('Beta Global Tech');
    expect(updated.version).toBe(2);

    // Tentativa de update com entidade defasada dispara erro de concorrência
    const client = await testPool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantAId]);
      const entity = await clientCompanyRepo.findById(company.id, client);
      expect(entity).not.toBeNull();

      // Força versão antiga na entidade em memória
      const staleEntity = Object.assign(Object.create(Object.getPrototypeOf(entity)), entity, {
        props: { ...(entity as unknown as { props: Record<string, unknown> }).props, version: 1 },
      });

      await expect(clientCompanyRepo.save(staleEntity, client)).rejects.toThrow(
        ClientCompanyDomainError,
      );
    } finally {
      client.release();
    }
  });

  it('transitions status, blocks operations and creates outbox events and audit logs', async () => {
    const company = await clientCompanyService.create(tenantAId, {
      legalName: 'Gama Alimentos S/A',
      commercialName: 'Gama Food',
      taxId: '33.444.555/0001-03',
    });

    const blocked = await clientCompanyService.changeStatus(tenantAId, company.id, {
      status: 'BLOCKED',
      reason: 'Auditoria fiscal pendente',
    });

    expect(blocked.status).toBe('BLOCKED');

    // Não deve permitir atualizar dados cadastrais enquanto bloqueada
    await expect(
      clientCompanyService.update(tenantAId, company.id, { commercialName: 'Tentativa' }),
    ).rejects.toThrow(ClientCompanyDomainError);

    // Verifica que evento foi registrado no Transactional Outbox
    const outboxRes = await testPool.query<{ count: string }>(
      `SELECT count(*)::text as count FROM integration.outbox_events 
       WHERE tenant_id = $1 AND aggregate_id = $2 AND event_type = 'ClientCompanyStatusChanged'`,
      [tenantAId, company.id],
    );
    expect(Number.parseInt(outboxRes.rows[0].count, 10)).toBeGreaterThanOrEqual(1);

    // Verifica que auditoria imutável foi registrada
    const auditRes = await testPool.query<{ count: string }>(
      `SELECT count(*)::text as count FROM audit.audit_records 
       WHERE tenant_id = $1 AND resource_id = $2 AND action = 'CLIENT_COMPANY_STATUS_CHANGED'`,
      [tenantAId, company.id],
    );
    expect(Number.parseInt(auditRes.rows[0].count, 10)).toBeGreaterThanOrEqual(1);
  });
});