import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { OutboxModule } from '../outbox/outbox.module';
import { WorkforceController } from './controllers/workforce.controller';
import { WorkforceManagementService } from './application/workforce-management.service';
import { PostgresWorkforceRepository } from './infrastructure/postgres-workforce.repository';
import { WORKFORCE_REPOSITORY_TOKEN } from './domain/workforce.repository';

@Module({
  imports: [DatabaseModule, OutboxModule],
  controllers: [WorkforceController],
  providers: [
    PostgresWorkforceRepository,
    {
      provide: WORKFORCE_REPOSITORY_TOKEN,
      useExisting: PostgresWorkforceRepository,
    },
    WorkforceManagementService,
  ],
  exports: [WorkforceManagementService, WORKFORCE_REPOSITORY_TOKEN],
})
export class WorkforceModule {}
