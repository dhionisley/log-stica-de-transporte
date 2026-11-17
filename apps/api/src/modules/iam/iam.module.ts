import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { CacheModule } from '../../common/cache/cache.module';
import { ObservabilityModule } from '../../common/observability/observability.module';
import { OutboxModule } from '../outbox/outbox.module';
import {
  PostgresUserRepository,
  PostgresPermissionProfileRepository,
  PostgresUserProfileAssignmentRepository,
  PostgresPermissionCatalogRepository,
  PostgresUserCredentialsRepository,
  PostgresUserSessionRepository,
  PostgresMfaMethodRepository,
} from './infrastructure/postgres-iam.repository';
import { IamManagementService } from './application/iam-management.service';
import { AuthorizationService } from './application/authorization.service';
import { SessionService } from './application/session.service';
import { MfaService } from './application/mfa.service';
import { AuthService } from './application/auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { IamController } from './controllers/iam.controller';
import { AuthController } from './controllers/auth.controller';

@Module({
  imports: [DatabaseModule, CacheModule, ObservabilityModule, OutboxModule],
  controllers: [IamController, AuthController],
  providers: [
    PostgresUserRepository,
    PostgresPermissionProfileRepository,
    PostgresUserProfileAssignmentRepository,
    PostgresPermissionCatalogRepository,
    PostgresUserCredentialsRepository,
    PostgresUserSessionRepository,
    PostgresMfaMethodRepository,
    IamManagementService,
    AuthorizationService,
    SessionService,
    MfaService,
    AuthService,
    JwtAuthGuard,
  ],
  exports: [
    IamManagementService,
    AuthorizationService,
    SessionService,
    MfaService,
    AuthService,
    JwtAuthGuard,
    PostgresUserRepository,
    PostgresPermissionProfileRepository,
    PostgresUserProfileAssignmentRepository,
    PostgresPermissionCatalogRepository,
    PostgresUserCredentialsRepository,
    PostgresUserSessionRepository,
    PostgresMfaMethodRepository,
  ],
})
export class IamModule {}
