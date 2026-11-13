import { Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { TenantManagementService } from './application/tenant-management.service';
import { TenantController } from './controllers/tenant.controller';
import { TENANT_REPOSITORY } from './domain/tenant.repository';
import { PostgresTenantRepository } from './infrastructure/postgres-tenant.repository';

@Module({
  imports: [OutboxModule],
  controllers: [TenantController],
  providers: [
    TenantManagementService,
    PostgresTenantRepository,
    {
      provide: TENANT_REPOSITORY,
      useExisting: PostgresTenantRepository,
    },
  ],
  exports: [TenantManagementService, TENANT_REPOSITORY],
})
export class PlatformModule {}
