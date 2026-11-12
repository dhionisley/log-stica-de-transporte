import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { REDIS_CLIENT } from '../common/cache/cache.module';
import { POSTGRES_POOL } from '../common/database/database.module';

type DependencyState = 'up' | 'down';

export interface ReadinessResult {
  status: 'ready';
  dependencies: {
    postgres: DependencyState;
    redis: DependencyState;
  };
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(POSTGRES_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async readiness(): Promise<ReadinessResult> {
    const [postgres, redis] = await Promise.allSettled([
      this.pool.query('SELECT 1'),
      this.redis.ping(),
    ]);
    const dependencies = {
      postgres: postgres.status === 'fulfilled' ? ('up' as const) : ('down' as const),
      redis: redis.status === 'fulfilled' ? ('up' as const) : ('down' as const),
    };

    if (dependencies.postgres === 'down' || dependencies.redis === 'down') {
      throw new ServiceUnavailableException({ status: 'not_ready', dependencies });
    }

    return { status: 'ready', dependencies };
  }
}
