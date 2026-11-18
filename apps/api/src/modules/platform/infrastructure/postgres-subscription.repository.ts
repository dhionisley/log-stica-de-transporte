import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { Plan, type PlanProps, type PlanStatus, type PlanFeatureValue } from '../domain/plan.entity';
import {
  Subscription,
  type SubscriptionProps,
  type SubscriptionStatus,
} from '../domain/subscription.entity';
import type {
  IPlanRepository,
  ISubscriptionRepository,
} from '../domain/subscription.repository';

interface PlanRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: PlanStatus;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

interface PlanFeatureRow {
  plan_id: string;
  feature_code: string;
  limit_value: PlanFeatureValue | string;
}

interface SubscriptionRow {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  starts_at: Date;
  ends_at: Date | null;
  custom_limits: Record<string, PlanFeatureValue> | string;
  version: string | number;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class PostgresPlanRepository implements IPlanRepository {
  async findById(client: PoolClient, id: string): Promise<Plan | null> {
    const res = await client.query<PlanRow>(
      `SELECT id, code, name, description, status, version, created_at, updated_at
       FROM platform.plans
       WHERE id = $1`,
      [id],
    );

    if (res.rows.length === 0) {
      return null;
    }

    const features = await this.loadFeatures(client, id);
    return this.mapToEntity(res.rows[0], features);
  }

  async findByCode(client: PoolClient, code: string): Promise<Plan | null> {
    const res = await client.query<PlanRow>(
      `SELECT id, code, name, description, status, version, created_at, updated_at
       FROM platform.plans
       WHERE code = $1`,
      [code.trim().toUpperCase()],
    );

    if (res.rows.length === 0) {
      return null;
    }

    const features = await this.loadFeatures(client, res.rows[0].id);
    return this.mapToEntity(res.rows[0], features);
  }

  async listActive(client: PoolClient): Promise<Plan[]> {
    const res = await client.query<PlanRow>(
      `SELECT id, code, name, description, status, version, created_at, updated_at
       FROM platform.plans
       WHERE status = 'ACTIVE'
       ORDER BY code ASC`,
    );

    const plans: Plan[] = [];
    for (const row of res.rows) {
      const features = await this.loadFeatures(client, row.id);
      plans.push(this.mapToEntity(row, features));
    }
    return plans;
  }

  async save(client: PoolClient, plan: Plan): Promise<void> {
    await client.query(
      `INSERT INTO platform.plans (id, code, name, description, status, version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         status = EXCLUDED.status,
         version = EXCLUDED.version,
         updated_at = EXCLUDED.updated_at`,
      [
        plan.id,
        plan.code,
        plan.name,
        plan.description ?? null,
        plan.status,
        plan.version,
        plan.createdAt,
        plan.updatedAt,
      ],
    );

    // Atualiza features
    for (const [code, val] of plan.features.entries()) {
      await client.query(
        `INSERT INTO platform.plan_features (plan_id, feature_code, limit_value, updated_at)
         VALUES ($1, $2, $3, now())
         ON CONFLICT (plan_id, feature_code) DO UPDATE SET
           limit_value = EXCLUDED.limit_value,
           updated_at = EXCLUDED.updated_at`,
        [plan.id, code, JSON.stringify(val)],
      );
    }
  }

  private async loadFeatures(client: PoolClient, planId: string): Promise<Map<string, PlanFeatureValue>> {
    const res = await client.query<PlanFeatureRow>(
      `SELECT feature_code, limit_value
       FROM platform.plan_features
       WHERE plan_id = $1`,
      [planId],
    );

    const map = new Map<string, PlanFeatureValue>();
    for (const row of res.rows) {
      const val = typeof row.limit_value === 'string' ? JSON.parse(row.limit_value) : row.limit_value;
      map.set(row.feature_code, val);
    }
    return map;
  }

  private mapToEntity(row: PlanRow, features: Map<string, PlanFeatureValue>): Plan {
    const props: PlanProps = {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description ?? undefined,
      status: row.status,
      features,
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return Plan.reconstitute(props);
  }
}

@Injectable()
export class PostgresSubscriptionRepository implements ISubscriptionRepository {
  async findByTenantId(client: PoolClient, tenantId: string): Promise<Subscription | null> {
    await this.setTenantContext(client, tenantId);
    const res = await client.query<SubscriptionRow>(
      `SELECT id, tenant_id, plan_id, status, starts_at, ends_at, custom_limits, version, created_at, updated_at
       FROM platform.subscriptions
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId],
    );

    if (res.rows.length === 0) {
      return null;
    }
    return this.mapToEntity(res.rows[0]);
  }

  async save(client: PoolClient, subscription: Subscription): Promise<void> {
    await this.setTenantContext(client, subscription.tenantId);
    await client.query(
      `INSERT INTO platform.subscriptions (
         id, tenant_id, plan_id, status, starts_at, ends_at, custom_limits, version, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         status = EXCLUDED.status,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         custom_limits = EXCLUDED.custom_limits,
         version = EXCLUDED.version,
         updated_at = EXCLUDED.updated_at`,
      [
        subscription.id,
        subscription.tenantId,
        subscription.planId,
        subscription.status,
        subscription.startsAt,
        subscription.endsAt ?? null,
        JSON.stringify(subscription.customLimits),
        subscription.version,
        subscription.createdAt,
        subscription.updatedAt,
      ],
    );
  }

  private async setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
  }

  private mapToEntity(row: SubscriptionRow): Subscription {
    const customLimits =
      typeof row.custom_limits === 'string' ? JSON.parse(row.custom_limits) : row.custom_limits;

    const props: SubscriptionProps = {
      id: row.id,
      tenantId: row.tenant_id,
      planId: row.plan_id,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at ?? undefined,
      customLimits: customLimits ?? {},
      version: Number(row.version),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return Subscription.reconstitute(props);
  }
}

