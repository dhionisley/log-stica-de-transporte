import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import { POSTGRES_POOL } from '../../../common/database/database.module';
import { PostgresOutboxRepository } from '../../outbox/infrastructure/postgres-outbox.repository';
import type { JsonValue } from '../../outbox/application/messaging.types';
import type { PlanFeatureValue } from '../domain/plan.entity';
import { Subscription } from '../domain/subscription.entity';
import {
  PostgresPlanRepository,
  PostgresSubscriptionRepository,
} from '../infrastructure/postgres-subscription.repository';
import { EntitlementService } from './entitlement.service';

export interface ProvisionSubscriptionDto {
  planCode: string;
  startsAt?: string;
  customLimits?: Record<string, PlanFeatureValue>;
}

export interface SubscriptionResponseDto {
  id: string;
  tenantId: string;
  planId: string;
  planCode: string;
  status: string;
  startsAt: string;
  endsAt?: string;
  customLimits: Record<string, PlanFeatureValue>;
  version: number;
}

@Injectable()
export class SubscriptionManagementService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    private readonly planRepo: PostgresPlanRepository,
    private readonly subscriptionRepo: PostgresSubscriptionRepository,
    private readonly entitlementService: EntitlementService,
    private readonly outboxRepository: PostgresOutboxRepository,
  ) {}

  private async withTransaction<T>(
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

  async getSubscription(tenantId: string): Promise<SubscriptionResponseDto> {
    const client = await this.pool.connect();
    try {
      const subscription = await this.subscriptionRepo.findByTenantId(client, tenantId);
      if (!subscription) {
        throw new NotFoundException(`Subscription not found for tenant ${tenantId}`);
      }
      const plan = await this.planRepo.findById(client, subscription.planId);
      return this.mapToDto(subscription, plan?.code ?? 'UNKNOWN');
    } finally {
      client.release();
    }
  }

  async provisionSubscription(
    tenantId: string,
    dto: ProvisionSubscriptionDto,
    actorId = 'system',
  ): Promise<SubscriptionResponseDto> {
    return this.withTransaction(tenantId, async (client) => {
      const plan = await this.planRepo.findByCode(client, dto.planCode);
      if (!plan || !plan.isActive()) {
        throw new BadRequestException(`Active plan with code "${dto.planCode}" not found`);
      }

      let subscription = await this.subscriptionRepo.findByTenantId(client, tenantId);
      if (subscription) {
        throw new BadRequestException(`Tenant ${tenantId} already has an existing subscription`);
      }

      subscription = Subscription.create({
        tenantId,
        planId: plan.id,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : new Date(),
        customLimits: dto.customLimits,
      });

      await this.subscriptionRepo.save(client, subscription);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Subscription',
        aggregateId: subscription.id,
        eventType: 'SubscriptionCreated',
        aggregateVersion: subscription.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        payload: {
          subscriptionId: subscription.id,
          planId: plan.id,
          planCode: plan.code,
          startsAt: subscription.startsAt.toISOString(),
          customLimits: subscription.customLimits as unknown as JsonValue,
        },
      });

      await this.audit(client, tenantId, actorId, 'subscription.created', subscription.id, {
        planCode: plan.code,
        status: subscription.status,
      });

      await this.entitlementService.invalidateCache(tenantId);

      return this.mapToDto(subscription, plan.code);
    });
  }

  async changePlan(
    tenantId: string,
    newPlanCode: string,
    actorId = 'system',
  ): Promise<SubscriptionResponseDto> {
    return this.withTransaction(tenantId, async (client) => {
      const subscription = await this.subscriptionRepo.findByTenantId(client, tenantId);
      if (!subscription) {
        throw new NotFoundException(`Subscription not found for tenant ${tenantId}`);
      }

      const newPlan = await this.planRepo.findByCode(client, newPlanCode);
      if (!newPlan || !newPlan.isActive()) {
        throw new BadRequestException(`Active plan with code "${newPlanCode}" not found`);
      }

      const oldPlanId = subscription.planId;
      subscription.changePlan(newPlan.id);
      await this.subscriptionRepo.save(client, subscription);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Subscription',
        aggregateId: subscription.id,
        eventType: 'PlanChanged',
        aggregateVersion: subscription.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        payload: {
          subscriptionId: subscription.id,
          oldPlanId,
          newPlanId: newPlan.id,
          newPlanCode: newPlan.code,
        },
      });

      await this.audit(client, tenantId, actorId, 'subscription.plan_changed', subscription.id, {
        oldPlanId,
        newPlanId: newPlan.id,
        newPlanCode: newPlan.code,
      });

      await this.entitlementService.invalidateCache(tenantId);

      return this.mapToDto(subscription, newPlan.code);
    });
  }

  async updateCustomLimits(
    tenantId: string,
    customLimits: Record<string, PlanFeatureValue>,
    actorId = 'system',
  ): Promise<SubscriptionResponseDto> {
    return this.withTransaction(tenantId, async (client) => {
      const subscription = await this.subscriptionRepo.findByTenantId(client, tenantId);
      if (!subscription) {
        throw new NotFoundException(`Subscription not found for tenant ${tenantId}`);
      }

      for (const [code, val] of Object.entries(customLimits)) {
        subscription.setCustomLimit(code, val);
      }

      await this.subscriptionRepo.save(client, subscription);

      await this.outboxRepository.append(client, {
        eventId: randomUUID(),
        tenantId,
        aggregateType: 'Subscription',
        aggregateId: subscription.id,
        eventType: 'CustomLimitsUpdated',
        aggregateVersion: subscription.version,
        schemaVersion: 1,
        occurredAt: new Date(),
        payload: {
          subscriptionId: subscription.id,
          customLimits: subscription.customLimits as unknown as JsonValue,
        },
      });

      await this.audit(client, tenantId, actorId, 'subscription.custom_limits_updated', subscription.id, {
        customLimits: subscription.customLimits,
      });

      await this.entitlementService.invalidateCache(tenantId);

      const plan = await this.planRepo.findById(client, subscription.planId);
      return this.mapToDto(subscription, plan?.code ?? 'UNKNOWN');
    });
  }

  private async audit(
    client: PoolClient,
    tenantId: string,
    actorId: string,
    action: string,
    resourceId: string,
    afterState: Record<string, unknown>,
  ): Promise<void> {
    await client.query(
      `INSERT INTO audit.audit_records (
         id, tenant_id, actor_id, action, resource_type, resource_id, after_state, occurred_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [
        randomUUID(),
        tenantId,
        toUuidOrNull(actorId),
        action,
        'Subscription',
        resourceId,
        JSON.stringify(afterState),
      ],
    );
  }

  private mapToDto(sub: Subscription, planCode: string): SubscriptionResponseDto {
    return {
      id: sub.id,
      tenantId: sub.tenantId,
      planId: sub.planId,
      planCode,
      status: sub.status,
      startsAt: sub.startsAt.toISOString(),
      endsAt: sub.endsAt?.toISOString(),
      customLimits: sub.customLimits,
      version: sub.version,
    };
  }
}

function toUuidOrNull(val?: string | null): string | null {
  if (!val) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val) ? val : null;
}
