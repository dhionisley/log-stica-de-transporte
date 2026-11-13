import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { PostgresOutboxRepository } from '../../outbox/infrastructure/postgres-outbox.repository';
import { Tenant, TenantStatus } from '../domain/tenant.entity';
import { TENANT_REPOSITORY, TenantRepository } from '../domain/tenant.repository';

export interface ProvisionTenantDto {
  slug: string;
  legalName: string;
  commercialName?: string;
  defaultTimezone?: string;
}

export interface TenantResponseDto {
  id: string;
  slug: string;
  legalName: string;
  commercialName?: string;
  status: TenantStatus;
  defaultTimezone: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export class TenantNotFoundError extends Error {
  constructor(id: string) {
    super(`Tenant not found: ${id}`);
    this.name = 'TenantNotFoundError';
  }
}

export class TenantSlugConflictError extends Error {
  constructor(slug: string) {
    super(`Tenant with slug "${slug}" already exists`);
    this.name = 'TenantSlugConflictError';
  }
}

@Injectable()
export class TenantManagementService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    @Inject(TENANT_REPOSITORY) private readonly tenantRepository: TenantRepository,
    private readonly outboxRepository: PostgresOutboxRepository,
  ) {}

  async provisionTenant(dto: ProvisionTenantDto, actorId = 'system'): Promise<TenantResponseDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const existing = await this.tenantRepository.findBySlug(client, dto.slug);
      if (existing) {
        throw new TenantSlugConflictError(dto.slug);
      }

      const tenant = Tenant.create({
        slug: dto.slug,
        legalName: dto.legalName,
        commercialName: dto.commercialName,
        defaultTimezone: dto.defaultTimezone,
      });

      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);
      await this.tenantRepository.save(client, tenant);

      // 1. Gravar evento no Transactional Outbox
      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId: tenant.id,
        eventType: 'TenantProvisioned',
        schemaVersion: 1,
        aggregateType: 'Tenant',
        aggregateId: tenant.id,
        aggregateVersion: tenant.version,
        occurredAt: new Date(),
        payload: {
          tenantId: tenant.id,
          slug: tenant.slug,
          legalName: tenant.legalName,
          status: tenant.status,
        },
      });

      // 2. Gravar evidência de auditoria imutável
      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenant.id,
          'SYSTEM',
          actorId,
          'TENANT_PROVISIONED',
          'Tenant',
          tenant.id,
          JSON.stringify({ slug: tenant.slug, legalName: tenant.legalName }),
        ],
      );

      await client.query('COMMIT');
      return this.toDto(tenant);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async activateTenant(tenantId: string, actorId = 'system'): Promise<TenantResponseDto> {
    return this.transitionStatus(tenantId, actorId, 'TENANT_ACTIVATED', (tenant) => {
      tenant.activate();
    });
  }

  async suspendTenant(tenantId: string, reason: string, actorId = 'system'): Promise<TenantResponseDto> {
    return this.transitionStatus(tenantId, actorId, 'TENANT_SUSPENDED', (tenant) => {
      tenant.suspend(reason);
    }, { reason });
  }

  async terminateTenant(tenantId: string, reason: string, actorId = 'system'): Promise<TenantResponseDto> {
    return this.transitionStatus(tenantId, actorId, 'TENANT_TERMINATED', (tenant) => {
      tenant.terminate(reason);
    }, { reason });
  }

  async getTenant(tenantId: string): Promise<TenantResponseDto> {
    const client = await this.pool.connect();
    try {
      const tenant = await this.tenantRepository.findById(client, tenantId);
      if (!tenant) {
        throw new TenantNotFoundError(tenantId);
      }
      return this.toDto(tenant);
    } finally {
      client.release();
    }
  }

  async getSettings(tenantId: string): Promise<Record<string, unknown>> {
    const client = await this.pool.connect();
    try {
      return await this.tenantRepository.findSettings(client, tenantId);
    } finally {
      client.release();
    }
  }

  async setSetting(tenantId: string, key: string, value: unknown, actorId = 'system'): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tenant = await this.tenantRepository.findById(client, tenantId, true);
      if (!tenant) {
        throw new TenantNotFoundError(tenantId);
      }

      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);
      await this.tenantRepository.setSetting(client, tenantId, key, value);

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenant.id,
          'SYSTEM',
          actorId,
          'TENANT_SETTING_UPDATED',
          'TenantSetting',
          key,
          JSON.stringify({ key, value }),
        ],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async transitionStatus(
    tenantId: string,
    actorId: string,
    action: string,
    transitionFn: (tenant: Tenant) => void,
    extraMetadata: Record<string, unknown> = {},
  ): Promise<TenantResponseDto> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const tenant = await this.tenantRepository.findById(client, tenantId, true);
      if (!tenant) {
        throw new TenantNotFoundError(tenantId);
      }

      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);

      const previousStatus = tenant.status;
      transitionFn(tenant);

      await this.tenantRepository.save(client, tenant);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId: tenant.id,
        eventType: action.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(''),
        schemaVersion: 1,
        aggregateType: 'Tenant',
        aggregateId: tenant.id,
        aggregateVersion: tenant.version,
        occurredAt: new Date(),
        payload: {
          tenantId: tenant.id,
          status: tenant.status,
          previousStatus,
          ...extraMetadata,
        },
      });

      await client.query(
        `INSERT INTO audit.audit_records (
           tenant_id, actor_type, actor_id, action, resource_type, resource_id, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [
          tenant.id,
          'SYSTEM',
          actorId,
          action,
          'Tenant',
          tenant.id,
          JSON.stringify({ previousStatus, newStatus: tenant.status, ...extraMetadata }),
        ],
      );

      await client.query('COMMIT');
      return this.toDto(tenant);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private toDto(tenant: Tenant): TenantResponseDto {
    return {
      id: tenant.id,
      slug: tenant.slug,
      legalName: tenant.legalName,
      commercialName: tenant.commercialName,
      status: tenant.status,
      defaultTimezone: tenant.defaultTimezone,
      version: tenant.version,
      createdAt: tenant.createdAt.toISOString(),
      updatedAt: tenant.updatedAt.toISOString(),
    };
  }
}
