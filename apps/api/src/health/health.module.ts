import { Controller, Get, Module } from '@nestjs/common';
import { CacheModule } from '../common/cache/cache.module';
import { DatabaseModule } from '../common/database/database.module';
import { HealthService, ReadinessResult } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  ready(): Promise<ReadinessResult> {
    return this.healthService.readiness();
  }
}

@Module({
  imports: [DatabaseModule, CacheModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
