import type { PoolClient } from 'pg';
import type { Plan } from './plan.entity';
import type { Subscription } from './subscription.entity';

export interface IPlanRepository {
  findById(client: PoolClient, id: string): Promise<Plan | null>;
  findByCode(client: PoolClient, code: string): Promise<Plan | null>;
  listActive(client: PoolClient): Promise<Plan[]>;
  save(client: PoolClient, plan: Plan): Promise<void>;
}

export interface ISubscriptionRepository {
  findByTenantId(client: PoolClient, tenantId: string): Promise<Subscription | null>;
  save(client: PoolClient, subscription: Subscription): Promise<void>;
}

