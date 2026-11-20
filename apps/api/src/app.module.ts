import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/environment';
import { ObservabilityModule } from './common/observability/observability.module';
import { HealthModule } from './health/health.module';
import { PlatformModule } from './modules/platform/platform.module';
import { IamModule } from './modules/iam/iam.module';
import { ClientsModule } from './modules/clients/clients.module';
import { WorkforceModule } from './modules/workforce/workforce.module';
import { FleetModule } from './modules/fleet/fleet.module';
import { AuditModule } from './modules/audit/audit.module';
import { OutboxModule } from './modules/outbox/outbox.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment }),
    ObservabilityModule,
    HealthModule,
    PlatformModule,
    IamModule,
    ClientsModule,
    WorkforceModule,
    FleetModule,
    AuditModule,
    OutboxModule,
  ],
})
export class AppModule {}
