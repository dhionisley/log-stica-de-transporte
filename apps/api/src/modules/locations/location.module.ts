import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ClientsModule } from '../clients/clients.module';
import { LOCATION_REPOSITORY_TOKEN } from './domain/location.repository';
import { PostgresLocationRepository } from './infrastructure/postgres-location.repository';
import { LocationManagementService } from './application/location-management.service';
import { LocationController } from './controllers/location.controller';

@Module({
  imports: [DatabaseModule, OutboxModule, ClientsModule],
  controllers: [LocationController],
  providers: [
    LocationManagementService,
    {
      provide: LOCATION_REPOSITORY_TOKEN,
      useClass: PostgresLocationRepository,
    },
  ],
  exports: [LocationManagementService, LOCATION_REPOSITORY_TOKEN],
})
export class LocationModule {}
