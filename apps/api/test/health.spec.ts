import { ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import type { Pool } from 'pg';
import { HealthController } from '../src/health/health.module';
import { HealthService } from '../src/health/health.service';

function createHealth() {
  const poolQuery = jest.fn<Promise<unknown>, []>().mockResolvedValue({ rows: [{ '?column?': 1 }] });
  const redisPing = jest.fn<Promise<string>, []>().mockResolvedValue('PONG');
  const pool = { query: poolQuery } as unknown as Pool;
  const redis = { ping: redisPing } as unknown as Redis;
  const service = new HealthService(pool, redis);
  return { controller: new HealthController(service), poolQuery, redisPing, service };
}

async function expectNotReady(
  operation: Promise<unknown>,
  dependencies: { postgres: 'up' | 'down'; redis: 'up' | 'down' },
) {
  try {
    await operation;
    throw new Error('Expected readiness to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    const exception = error as ServiceUnavailableException;
    expect(exception.getStatus()).toBe(503);
    expect(exception.getResponse()).toEqual({ status: 'not_ready', dependencies });
    expect(JSON.stringify(exception.getResponse())).not.toContain('secret');
  }
}

describe('HealthController', () => {
  it('reports the process as live', () => {
    const { controller } = createHealth();
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('reports readiness when PostgreSQL and Redis are available', async () => {
    const { controller } = createHealth();
    await expect(controller.ready()).resolves.toEqual({
      status: 'ready',
      dependencies: { postgres: 'up', redis: 'up' },
    });
  });
});

describe('HealthService', () => {
  it('returns a sanitized 503 when PostgreSQL is unavailable', async () => {
    const { poolQuery, service } = createHealth();
    poolQuery.mockRejectedValueOnce(new Error('secret database detail'));

    await expectNotReady(service.readiness(), { postgres: 'down', redis: 'up' });
  });

  it('returns a sanitized 503 when Redis is unavailable', async () => {
    const { redisPing, service } = createHealth();
    redisPing.mockRejectedValueOnce(new Error('secret redis detail'));

    await expectNotReady(service.readiness(), { postgres: 'up', redis: 'down' });
  });
});
