import { Inject, Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { REDIS_CLIENT } from '../../../common/cache/cache.module';
import type { PlanFeatureValue } from '../domain/plan.entity';
import {
  PostgresPlanRepository,
  PostgresSubscriptionRepository,
} from '../infrastructure/postgres-subscription.repository';

export interface TenantEntitlements {
  tenantId: string;
  hasActiveSubscription: boolean;
  planId?: string;
  planCode?: string;
  status?: string;
  features: Record<string, PlanFeatureValue>;
}

@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);
  private readonly cacheTtlSeconds = 3600; // 1 hora

  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly planRepo: PostgresPlanRepository,
    private readonly subscriptionRepo: PostgresSubscriptionRepository,
  ) {}

  private getCacheKey(tenantId: string): string {
    return `platform:entitlements:${tenantId}`;
  }

  async resolveEntitlements(tenantId: string): Promise<TenantEntitlements> {
    const cacheKey = this.getCacheKey(tenantId);

    // 1. Tenta recuperar do Redis
    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached) as TenantEntitlements;
      }
    } catch (err) {
      this.logger.warn(`Redis entitlement cache read failed: ${(err as Error).message}`);
    }

    // 2. Consulta PostgreSQL
    const client = await this.pool.connect();
    try {
      const subscription = await this.subscriptionRepo.findByTenantId(client, tenantId);
      if (!subscription || !subscription.isActive()) {
        const inactiveEntitlements: TenantEntitlements = {
          tenantId,
          hasActiveSubscription: false,
          features: {},
        };
        await this.setCacheSafely(cacheKey, inactiveEntitlements, 300);
        return inactiveEntitlements;
      }

      const plan = await this.planRepo.findById(client, subscription.planId);
      if (!plan || !plan.isActive()) {
        const noPlanEntitlements: TenantEntitlements = {
          tenantId,
          hasActiveSubscription: false,
          features: {},
        };
        await this.setCacheSafely(cacheKey, noPlanEntitlements, 300);
        return noPlanEntitlements;
      }

      // 3. Aplica consolidação com precedência (overlay pattern)
      const consolidatedFeatures: Record<string, PlanFeatureValue> = {};
      for (const [code, val] of plan.features.entries()) {
        consolidatedFeatures[code] = { ...val };
      }

      // Sobrepõe custom limits negociados especificamente para a transportadora
      for (const [code, val] of Object.entries(subscription.customLimits)) {
        consolidatedFeatures[code] = { ...val };
      }

      const result: TenantEntitlements = {
        tenantId,
        hasActiveSubscription: true,
        planId: plan.id,
        planCode: plan.code,
        status: subscription.status,
        features: consolidatedFeatures,
      };

      await this.setCacheSafely(cacheKey, result, this.cacheTtlSeconds);
      return result;
    } finally {
      client.release();
    }
  }

  async hasFeature(tenantId: string, featureCode: string): Promise<boolean> {
    const entitlements = await this.resolveEntitlements(tenantId);
    if (!entitlements.hasActiveSubscription) {
      return false;
    }

    const feature = entitlements.features[featureCode];
    return Boolean(feature?.enabled);
  }

  async checkLimit(
    tenantId: string,
    limitCode: string,
    currentCount: number,
  ): Promise<{ allowed: boolean; max: number; current: number }> {
    const entitlements = await this.resolveEntitlements(tenantId);
    if (!entitlements.hasActiveSubscription) {
      return { allowed: false, max: 0, current: currentCount };
    }

    const feature = entitlements.features[limitCode];
    if (!feature || !feature.enabled) {
      return { allowed: false, max: 0, current: currentCount };
    }

    const max = feature.max ?? -1;
    if (max === -1) {
      return { allowed: true, max: -1, current: currentCount };
    }

    return {
      allowed: currentCount < max,
      max,
      current: currentCount,
    };
  }

  async invalidateCache(tenantId: string): Promise<void> {
    try {
      await this.redis.del(this.getCacheKey(tenantId));
    } catch (err) {
      this.logger.warn(`Failed to invalidate entitlement cache for tenant ${tenantId}: ${(err as Error).message}`);
    }
  }

  private async setCacheSafely(key: string, data: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(key, JSON.stringify(data), 'EX', ttlSeconds);
    } catch (err) {
      this.logger.warn(`Redis entitlement cache write failed: ${(err as Error).message}`);
    }
  }
}

