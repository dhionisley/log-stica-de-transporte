import { PoolClient } from 'pg';
import { Tenant } from './tenant.entity';

export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

export interface TenantRepository {
  findById(client: PoolClient, id: string, forUpdate?: boolean): Promise<Tenant | null>;
  findBySlug(client: PoolClient, slug: string): Promise<Tenant | null>;
  save(client: PoolClient, tenant: Tenant): Promise<void>;
  findSettings(client: PoolClient, tenantId: string): Promise<Record<string, unknown>>;
  setSetting(client: PoolClient, tenantId: string, key: string, value: unknown): Promise<void>;
}

