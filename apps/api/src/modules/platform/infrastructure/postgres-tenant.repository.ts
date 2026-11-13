import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Tenant, TenantStatus } from '../domain/tenant.entity';
import { TenantRepository } from '../domain/tenant.repository';

interface TenantRow {
  id: string;
  slug: string;
  legal_name: string;
  commercial_name: string | null;
  status: TenantStatus;
  default_timezone: string;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

interface SettingRow {
  setting_key: string;
  setting_value: unknown;
}

@Injectable()
export class PostgresTenantRepository implements TenantRepository {
  async findById(client: PoolClient, id: string, forUpdate = false): Promise<Tenant | null> {
    const lockClause = forUpdate ? 'FOR UPDATE' : '';
    const res = await client.query<TenantRow>(
      `SELECT id, slug, legal_name, commercial_name, status, default_timezone, version, created_at, updated_at
       FROM platform.tenants
       WHERE id = $1 ${lockClause}`,
      [id],
    );

    if (res.rows.length === 0) {
      return null;
    }

    return this.mapToEntity(res.rows[0]);
  }

  async findBySlug(client: PoolClient, slug: string): Promise<Tenant | null> {
    const res = await client.query<TenantRow>(
      `SELECT id, slug, legal_name, commercial_name, status, default_timezone, version, created_at, updated_at
       FROM platform.tenants
       WHERE slug = $1`,
      [slug],
    );

    if (res.rows.length === 0) {
      return null;
    }

    return this.mapToEntity(res.rows[0]);
  }

  async save(client: PoolClient, tenant: Tenant): Promise<void> {
    await client.query(
      `INSERT INTO platform.tenants (
         id, slug, legal_name, commercial_name, status, default_timezone, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         legal_name = EXCLUDED.legal_name,
         commercial_name = EXCLUDED.commercial_name,
         status = EXCLUDED.status,
         default_timezone = EXCLUDED.default_timezone,
         version = EXCLUDED.version,
         updated_at = EXCLUDED.updated_at`,
      [
        tenant.id,
        tenant.slug,
        tenant.legalName,
        tenant.commercialName ?? null,
        tenant.status,
        tenant.defaultTimezone,
        tenant.version,
        tenant.createdAt,
        tenant.updatedAt,
      ],
    );
  }

  async findSettings(client: PoolClient, tenantId: string): Promise<Record<string, unknown>> {
    const res = await client.query<SettingRow>(
      `SELECT setting_key, setting_value FROM platform.tenant_settings WHERE tenant_id = $1`,
      [tenantId],
    );

    const result: Record<string, unknown> = {};
    for (const row of res.rows) {
      result[row.setting_key] = row.setting_value;
    }
    return result;
  }

  async setSetting(client: PoolClient, tenantId: string, key: string, value: unknown): Promise<void> {
    await client.query(
      `INSERT INTO platform.tenant_settings (tenant_id, setting_key, setting_value, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (tenant_id, setting_key) DO UPDATE SET
         setting_value = EXCLUDED.setting_value,
         version = platform.tenant_settings.version + 1,
         updated_at = now()`,
      [tenantId, key, JSON.stringify(value)],
    );
  }

  private mapToEntity(row: TenantRow): Tenant {
    return Tenant.reconstitute({
      id: row.id,
      slug: row.slug,
      legalName: row.legal_name,
      commercialName: row.commercial_name ?? undefined,
      status: row.status,
      defaultTimezone: row.default_timezone,
      version: Number(row.version),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }
}

