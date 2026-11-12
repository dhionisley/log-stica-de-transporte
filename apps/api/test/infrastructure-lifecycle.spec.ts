import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { CacheLifecycle } from '../src/common/cache/cache.module';
import { DatabaseLifecycle } from '../src/common/database/database.module';

describe('infrastructure lifecycle', () => {
  it('closes the PostgreSQL pool on shutdown', async () => {
    const pool = { end: jest.fn().mockResolvedValue(undefined) } as unknown as Pool;
    await new DatabaseLifecycle(pool).onApplicationShutdown();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });

  it('quits Redis on shutdown', async () => {
    const redis = {
      quit: jest.fn().mockResolvedValue('OK'),
      disconnect: jest.fn(),
    } as unknown as Redis;
    await new CacheLifecycle(redis).onApplicationShutdown();
    expect(redis.quit).toHaveBeenCalledTimes(1);
    expect(redis.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects Redis when graceful quit fails', async () => {
    const redis = {
      quit: jest.fn().mockRejectedValue(new Error('offline')),
      disconnect: jest.fn(),
    } as unknown as Redis;
    await new CacheLifecycle(redis).onApplicationShutdown();
    expect(redis.disconnect).toHaveBeenCalledTimes(1);
  });
});
