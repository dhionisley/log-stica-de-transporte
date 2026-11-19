import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { PostgresOutboxRepository } from '../../outbox/infrastructure/postgres-outbox.repository';
import {
  BillingAddress,
  ClientCompany,
  ClientCompanyDomainError,
  type ClientCompanyStatus,
  type CompanyContact,
  normalizeTaxId,
} from '../domain/client-company.entity';
import {
  CLIENT_COMPANY_REPOSITORY_TOKEN,
  type IClientCompanyRepository,
  type ListClientCompaniesFilter,
} from '../domain/client-company.repository';
import { toIntegrationPayload } from '../domain/client-company.events';

export interface CreateClientCompanyDto {
  legalName: string;
  commercialName: string;
  taxId: string;
  timezone?: string;
  billingAddress?: BillingAddress;
  billingContactData?: Record<string, unknown>;
  contacts?: CompanyContact[];
}

export interface UpdateClientCompanyDto {
  legalName?: string;
  commercialName?: string;
  timezone?: string;
  billingAddress?: BillingAddress;
  billingContactData?: Record<string, unknown>;
  contacts?: CompanyContact[];
}

export interface ChangeClientCompanyStatusDto {
  status: ClientCompanyStatus;
  reason?: string;
}

export interface ClientCompanyResponseDto {
  id: string;
  tenantId: string;
  legalName: string;
  commercialName: string;
  taxId: string;
  status: ClientCompanyStatus;
  timezone: string;
  billingAddress: BillingAddress;
  billingContactData: Record<string, unknown>;
  contacts: CompanyContact[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class ClientCompanyNotFoundError extends Error {
  constructor(id: string) {
    super(`Client company not found: ${id}`);
    this.name = 'ClientCompanyNotFoundError';
  }
}

export class ClientCompanyTaxIdConflictError extends Error {
  constructor(taxId: string) {
    super(`Client company with tax ID "${taxId}" already exists in this tenant`);
    this.name = 'ClientCompanyTaxIdConflictError';
  }
}

function toUuidOrNull(val?: string | null): string | null {
  if (!val) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) ? val : null;
}

@Injectable()
export class ClientCompanyManagementService {
  constructor(
    @Inject(POSTGRES_POOL)
    private readonly pool: Pool,
    @Inject(CLIENT_COMPANY_REPOSITORY_TOKEN)
    private readonly repository: IClientCompanyRepository,
    private readonly outboxRepository: PostgresOutboxRepository,
  ) {}

  private async withTenantTransaction<T>(
    tenantId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async create(
    tenantId: string,
    dto: CreateClientCompanyDto,
    actorId = 'system',
  ): Promise<ClientCompanyResponseDto> {
    const normalizedTaxId = normalizeTaxId(dto.taxId);

    return this.withTenantTransaction(tenantId, async (client) => {
      const existing = await this.repository.findByTaxId(normalizedTaxId, client);
      if (existing) {
        throw new ClientCompanyTaxIdConflictError(dto.taxId);
      }

      const company = ClientCompany.create({
        tenantId,
        legalName: dto.legalName,
        commercialName: dto.commercialName,
        taxId: dto.taxId,
        timezone: dto.timezone,
        billingAddress: dto.billingAddress,
        billingContactData: dto.billingContactData,
        contacts: dto.contacts,
      });

      await this.repository.save(company, client);

      // Emite evento no Transactional Outbox
      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'ClientCompany',
        aggregateId: company.id,
        aggregateVersion: company.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'ClientCompanyCreated',
        payload: toIntegrationPayload({
          id: company.id,
          tenantId: company.tenantId,
          legalName: company.legalName,
          commercialName: company.commercialName,
          taxId: company.taxId,
          status: company.status,
        }),
      });

      // Grava auditoria imutável
      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'CLIENT_COMPANY_CREATED',
          'ClientCompany',
          company.id,
          JSON.stringify({
            legalName: company.legalName,
            commercialName: company.commercialName,
            taxId: company.taxId,
            status: company.status,
          }),
        ],
      );

      return this.toDto(company);
    });
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateClientCompanyDto,
    actorId = 'system',
  ): Promise<ClientCompanyResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const company = await this.repository.findById(id, client);
      if (!company) {
        throw new ClientCompanyNotFoundError(id);
      }

      const previousState = {
        legalName: company.legalName,
        commercialName: company.commercialName,
        timezone: company.timezone,
        status: company.status,
        version: company.version,
      };

      company.update(dto);

      await this.repository.save(company, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'ClientCompany',
        aggregateId: company.id,
        aggregateVersion: company.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'ClientCompanyUpdated',
        payload: toIntegrationPayload({
          id: company.id,
          tenantId: company.tenantId,
          legalName: company.legalName,
          commercialName: company.commercialName,
          taxId: company.taxId,
          status: company.status,
          version: company.version,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, before_state, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'CLIENT_COMPANY_UPDATED',
          'ClientCompany',
          company.id,
          JSON.stringify(previousState),
          JSON.stringify({
            legalName: company.legalName,
            commercialName: company.commercialName,
            timezone: company.timezone,
            status: company.status,
            version: company.version,
          }),
        ],
      );

      return this.toDto(company);
    });
  }

  async changeStatus(
    tenantId: string,
    id: string,
    dto: ChangeClientCompanyStatusDto,
    actorId = 'system',
  ): Promise<ClientCompanyResponseDto> {
    return this.withTenantTransaction(tenantId, async (client) => {
      const company = await this.repository.findById(id, client);
      if (!company) {
        throw new ClientCompanyNotFoundError(id);
      }

      const previousStatus = company.status;
      if (dto.status === 'ACTIVE') {
        company.activate();
      } else if (dto.status === 'INACTIVE') {
        company.inactivate();
      } else if (dto.status === 'BLOCKED') {
        company.block(dto.reason);
      } else {
        throw new ClientCompanyDomainError(`Unsupported status: ${dto.status}`);
      }

      await this.repository.save(company, client);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'ClientCompany',
        aggregateId: company.id,
        aggregateVersion: company.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        eventType: 'ClientCompanyStatusChanged',
        payload: toIntegrationPayload({
          id: company.id,
          tenantId: company.tenantId,
          previousStatus,
          newStatus: company.status,
          reason: dto.reason,
          version: company.version,
        }),
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, reason, before_state, after_state
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)`,
        [
          tenantId,
          'USER',
          toUuidOrNull(actorId),
          'CLIENT_COMPANY_STATUS_CHANGED',
          'ClientCompany',
          company.id,
          dto.reason ?? null,
          JSON.stringify({ status: previousStatus }),
          JSON.stringify({ status: company.status }),
        ],
      );

      return this.toDto(company);
    });
  }

  async findById(tenantId: string, id: string): Promise<ClientCompanyResponseDto> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const company = await this.repository.findById(id, client);
      if (!company) {
        throw new ClientCompanyNotFoundError(id);
      }
      return this.toDto(company);
    } finally {
      client.release();
    }
  }

  async list(
    tenantId: string,
    filter?: ListClientCompaniesFilter,
  ): Promise<{ items: ClientCompanyResponseDto[]; total: number }> {
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
      const result = await this.repository.list(filter, client);
      return {
        items: result.items.map((c) => this.toDto(c)),
        total: result.total,
      };
    } finally {
      client.release();
    }
  }

  private toDto(company: ClientCompany): ClientCompanyResponseDto {
    return {
      id: company.id,
      tenantId: company.tenantId,
      legalName: company.legalName,
      commercialName: company.commercialName,
      taxId: company.taxId,
      status: company.status,
      timezone: company.timezone,
      billingAddress: { ...company.billingAddress },
      billingContactData: { ...company.billingContactData },
      contacts: company.contacts.map((c) => ({ ...c })),
      version: company.version,
      createdAt: company.createdAt.toISOString(),
      updatedAt: company.updatedAt.toISOString(),
    };
  }
}