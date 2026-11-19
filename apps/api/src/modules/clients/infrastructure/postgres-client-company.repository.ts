import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import {
  BillingAddress,
  ClientCompany,
  ClientCompanyDomainError,
  type ClientCompanyProps,
  type ClientCompanyStatus,
  type CompanyContact,
} from '../domain/client-company.entity';
import type {
  IClientCompanyRepository,
  ListClientCompaniesFilter,
  ListClientCompaniesResult,
} from '../domain/client-company.repository';

interface ClientCompanyRow {
  id: string;
  tenant_id: string;
  legal_name: string;
  commercial_name: string;
  tax_id: string;
  status: ClientCompanyStatus;
  timezone: string;
  billing_address: BillingAddress | string;
  billing_contact_data: Record<string, unknown> | string;
  contacts: CompanyContact[] | string;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PostgresClientCompanyRepository implements IClientCompanyRepository {
  constructor(
    @Inject(POSTGRES_POOL)
    private readonly pool: Pool,
  ) {}

  private getRunner(client?: PoolClient): Pool | PoolClient {
    return client ?? this.pool;
  }

  async findById(id: string, client?: PoolClient): Promise<ClientCompany | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<ClientCompanyRow>(
      `SELECT id, tenant_id, legal_name, commercial_name, tax_id, status, timezone,
              billing_address, billing_contact_data, contacts, version, created_at, updated_at
       FROM crm.client_companies
       WHERE id = $1`,
      [id],
    );

    if (res.rows.length === 0) {
      return null;
    }

    return this.mapToEntity(res.rows[0]);
  }

  async findByTaxId(taxId: string, client?: PoolClient): Promise<ClientCompany | null> {
    const runner = this.getRunner(client);
    const res = await runner.query<ClientCompanyRow>(
      `SELECT id, tenant_id, legal_name, commercial_name, tax_id, status, timezone,
              billing_address, billing_contact_data, contacts, version, created_at, updated_at
       FROM crm.client_companies
       WHERE tax_id = $1`,
      [taxId],
    );

    if (res.rows.length === 0) {
      return null;
    }

    return this.mapToEntity(res.rows[0]);
  }

  async save(company: ClientCompany, client?: PoolClient): Promise<void> {
    const runner = this.getRunner(client);

    const existingRes = await runner.query<{ version: string | number }>(
      `SELECT version FROM crm.client_companies WHERE id = $1`,
      [company.id],
    );

    if (existingRes.rows.length === 0) {
      await runner.query(
        `INSERT INTO crm.client_companies (
           id, tenant_id, legal_name, commercial_name, tax_id, status, timezone,
           billing_address, billing_contact_data, contacts, version, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13)`,
        [
          company.id,
          company.tenantId,
          company.legalName,
          company.commercialName,
          company.taxId,
          company.status,
          company.timezone,
          JSON.stringify(company.billingAddress),
          JSON.stringify(company.billingContactData),
          JSON.stringify(company.contacts),
          company.version,
          company.createdAt,
          company.updatedAt,
        ],
      );
    } else {
      const updateRes = await runner.query(
        `UPDATE crm.client_companies SET
           legal_name = $1,
           commercial_name = $2,
           status = $3,
           timezone = $4,
           billing_address = $5::jsonb,
           billing_contact_data = $6::jsonb,
           contacts = $7::jsonb,
           version = version + 1,
           updated_at = $8
         WHERE id = $9 AND tenant_id = $10 AND version = $11
         RETURNING version`,
        [
          company.legalName,
          company.commercialName,
          company.status,
          company.timezone,
          JSON.stringify(company.billingAddress),
          JSON.stringify(company.billingContactData),
          JSON.stringify(company.contacts),
          company.updatedAt,
          company.id,
          company.tenantId,
          company.version,
        ],
      );

      if (updateRes.rowCount === 0) {
        throw new ClientCompanyDomainError(
          `Concurrency conflict: client company ${company.id} has been modified concurrently`,
        );
      }
    }
  }

  async list(
    filter?: ListClientCompaniesFilter,
    client?: PoolClient,
  ): Promise<ListClientCompaniesResult> {
    const runner = this.getRunner(client);
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filter?.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filter.status);
    }

    if (filter?.search) {
      conditions.push(
        `(legal_name ILIKE $${paramIndex} OR commercial_name ILIKE $${paramIndex} OR tax_id ILIKE $${paramIndex})`,
      );
      params.push(`%${filter.search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await runner.query<{ count: string }>(
      `SELECT count(*)::text as count FROM crm.client_companies WHERE ${whereClause}`,
      params,
    );
    const total = Number.parseInt(countRes.rows[0]?.count ?? '0', 10);

    const limit = filter?.limit ?? 20;
    const offset = filter?.offset ?? 0;

    const queryParams = [...params, limit, offset];
    const dataRes = await runner.query<ClientCompanyRow>(
      `SELECT id, tenant_id, legal_name, commercial_name, tax_id, status, timezone,
              billing_address, billing_contact_data, contacts, version, created_at, updated_at
       FROM crm.client_companies
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      queryParams,
    );

    const items = dataRes.rows.map((row) => this.mapToEntity(row));
    return { items, total };
  }

  private mapToEntity(row: ClientCompanyRow): ClientCompany {
    const parseJson = <T>(val: T | string, fallback: T): T => {
      if (typeof val === 'string') {
        try {
          return JSON.parse(val) as T;
        } catch {
          return fallback;
        }
      }
      return val ?? fallback;
    };

    const props: ClientCompanyProps = {
      id: row.id,
      tenantId: row.tenant_id,
      legalName: row.legal_name,
      commercialName: row.commercial_name,
      taxId: row.tax_id,
      status: row.status,
      timezone: row.timezone,
      billingAddress: parseJson<BillingAddress>(row.billing_address, {
        street: '',
        number: '',
        neighborhood: '',
        city: '',
        state: '',
        postalCode: '',
      }),
      billingContactData: parseJson<Record<string, unknown>>(row.billing_contact_data, {}),
      contacts: parseJson<CompanyContact[]>(row.contacts, []),
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return ClientCompany.reconstitute(props);
  }
}