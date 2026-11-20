import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../common/database/database.module';
import { OutboxModule } from '../outbox/outbox.module';
import { WorkforceModule } from '../workforce/workforce.module';
import { VEHICLE_REPOSITORY_TOKEN } from './domain/vehicle.repository';
import { PostgresVehicleRepository } from './infrastructure/postgres-vehicle.repository';
import { VehicleManagementService } from './application/vehicle-management.service';
import { VehicleController } from './controllers/vehicle.controller';

@Module({
  imports: [DatabaseModule, OutboxModule, WorkforceModule],
  controllers: [VehicleController],
  providers: [
    VehicleManagementService,
    {
      provide: VEHICLE_REPOSITORY_TOKEN,
      useClass: PostgresVehicleRepository,
    },
  ],
  exports: [VehicleManagementService, VEHICLE_REPOSITORY_TOKEN],
})
export class FleetModule {}
