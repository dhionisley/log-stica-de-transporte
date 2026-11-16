import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { OutboxModule } from '../outbox/outbox.module';
import {
  PostgresUserRepository,
  PostgresPermissionProfileRepository,
  PostgresUserProfileAssignmentRepository,
  PostgresPermissionCatalogRepository,
} from './infrastructure/postgres-iam.repository';
import { IamManagementService } from './application/iam-management.service';
import { AuthorizationService } from './application/authorization.service';
import { IamController } from './controllers/iam.controller';

@Module({
  imports: [DatabaseModule, OutboxModule],
  controllers: [IamController],
  providers: [
    PostgresUserRepository,
    PostgresPermissionProfileRepository,
    PostgresUserProfileAssignmentRepository,
    PostgresPermissionCatalogRepository,
    IamManagementService,
    AuthorizationService,
  ],
  exports: [
    IamManagementService,
    AuthorizationService,
    PostgresUserRepository,
    PostgresPermissionProfileRepository,
    PostgresUserProfileAssignmentRepository,
    PostgresPermissionCatalogRepository,
  ],
})
export class IamModule {}
