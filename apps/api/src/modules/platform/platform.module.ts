import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { CacheModule } from '../../common/cache/cache.module';
import { ObservabilityModule } from '../../common/observability/observability.module';
import { OutboxModule } from '../outbox/outbox.module';
import { TenantManagementService } from './application/tenant-management.service';
import { EntitlementService } from './application/entitlement.service';
import { SubscriptionManagementService } from './application/subscription-management.service';
import { TenantController } from './controllers/tenant.controller';
import { PlanController } from './controllers/plan.controller';
import { SubscriptionController } from './controllers/subscription.controller';
import { TENANT_REPOSITORY } from './domain/tenant.repository';
import { PostgresTenantRepository } from './infrastructure/postgres-tenant.repository';
import {
  PostgresPlanRepository,
  PostgresSubscriptionRepository,
} from './infrastructure/postgres-subscription.repository';
import { EntitlementGuard } from './guards/entitlement.guard';

@Module({
  imports: [DatabaseModule, CacheModule, ObservabilityModule, OutboxModule],
  controllers: [TenantController, PlanController, SubscriptionController],
  providers: [
    TenantManagementService,
    EntitlementService,
    SubscriptionManagementService,
    PostgresTenantRepository,
    PostgresPlanRepository,
    PostgresSubscriptionRepository,
    EntitlementGuard,
    {
      provide: TENANT_REPOSITORY,
      useExisting: PostgresTenantRepository,
    },
  ],
  exports: [
    TenantManagementService,
    EntitlementService,
    SubscriptionManagementService,
    EntitlementGuard,
    TENANT_REPOSITORY,
    PostgresTenantRepository,
    PostgresPlanRepository,
    PostgresSubscriptionRepository,
  ],
})
export class PlatformModule {}
