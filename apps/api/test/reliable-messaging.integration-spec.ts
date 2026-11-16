import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { IntegrationEvent, JsonValue } from '../src/modules/outbox/application/messaging.types';
import { PostgresInboxRepository } from '../src/modules/outbox/infrastructure/postgres-inbox.repository';
import { PostgresOutboxRepository } from '../src/modules/outbox/infrastructure/postgres-outbox.repository';

const tenantA = '30000000-0000-0000-0000-000000000001';
const tenantB = '30000000-0000-0000-0000-000000000002';
const connectionString =
  process.env.TEST_DATABASE_URL ?? 'postgresql://transport:transport@127.0.0.1:5432/transport';

describe('reliable messaging PostgreSQL integration', () => {
  const pool = new Pool({ connectionString });
  const outbox = new PostgresOutboxRepository();
  const inbox = new PostgresInboxRepository();
  const eventIds: string[] = [];
  const auditIds: string[] = [];
  const messageIds: string[] = [];

  async function withTenant<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE transport_rls_test');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  function event(tenantId: string): IntegrationEvent {
    const value: IntegrationEvent = {
      eventId: randomUUID(),
      tenantId,
      eventType: 'platform.test.recorded.v1',
      schemaVersion: 1,
      aggregateType: 'TestAggregate',
      aggregateId: randomUUID(),
      aggregateVersion: 1,
      correlationId: randomUUID(),
      payload: { source: 'integration-test' },
      occurredAt: new Date(),
    };
    eventIds.push(value.eventId);
    return value;
  }

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO platform.tenants (id, slug, legal_name, status)
       VALUES ($1, 'messaging-test-a', 'Messaging Test A', 'ACTIVE'),
              ($2, 'messaging-test-b', 'Messaging Test B', 'ACTIVE')
       ON CONFLICT (id) DO NOTHING`,
      [tenantA, tenantB],
    );
    await pool.query(`DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'transport_rls_test') THEN
          CREATE ROLE transport_rls_test NOLOGIN;
        END IF;
      END $$`);
    await pool.query('GRANT USAGE ON SCHEMA platform, iam, audit, integration TO transport_rls_test');
    await pool.query(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA platform, iam, audit, integration TO transport_rls_test',
    );
    await pool.query('GRANT transport_rls_test TO CURRENT_USER');
  });

  afterAll(async () => {
    if (messageIds.length > 0) {
      await pool.query('DELETE FROM integration.inbox_messages WHERE message_id = ANY($1::uuid[])', [
        messageIds,
      ]);
    }
    if (eventIds.length > 0) {
      await pool.query('DELETE FROM integration.outbox_events WHERE id = ANY($1::uuid[])', [eventIds]);
    }
    if (auditIds.length > 0) {
      await pool.query('DELETE FROM audit.audit_records WHERE id = ANY($1::uuid[])', [auditIds]);
    }
    await pool.end();
  });

  it('commits an audit change and its outbox event together', async () => {
    const auditId = randomUUID();
    auditIds.push(auditId);
    const integrationEvent = event(tenantA);

    await withTenant(tenantA, async (client) => {
      await client.query(
        `INSERT INTO audit.audit_records
          (id, tenant_id, actor_type, action, resource_type, resource_id)
         VALUES ($1, $2, 'SYSTEM', 'TEST', 'TestAggregate', $3)`,
        [auditId, tenantA, integrationEvent.aggregateId],
      );
      await outbox.append(client, integrationEvent);
    });

    await withTenant(tenantA, async (client) => {
      const result = await client.query(
        `SELECT
          (SELECT count(*)::int FROM audit.audit_records WHERE id = $1) AS audit_count,
          (SELECT count(*)::int FROM integration.outbox_events WHERE id = $2) AS event_count`,
        [auditId, integrationEvent.eventId],
      );
      expect(result.rows[0]).toEqual({ audit_count: 1, event_count: 1 });
    });
  });

  it('rolls back the domain evidence and outbox event together', async () => {
    const auditId = randomUUID();
    auditIds.push(auditId);
    const integrationEvent = event(tenantA);

    await expect(
      withTenant(tenantA, async (client) => {
        await client.query(
          `INSERT INTO audit.audit_records
            (id, tenant_id, actor_type, action, resource_type, resource_id)
           VALUES ($1, $2, 'SYSTEM', 'TEST_ROLLBACK', 'TestAggregate', $3)`,
          [auditId, tenantA, integrationEvent.aggregateId],
        );
        await outbox.append(client, integrationEvent);
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    const result = await pool.query(
      `SELECT
        (SELECT count(*)::int FROM audit.audit_records WHERE id = $1) AS audit_count,
        (SELECT count(*)::int FROM integration.outbox_events WHERE id = $2) AS event_count`,
      [auditId, integrationEvent.eventId],
    );
    expect(result.rows[0]).toEqual({ audit_count: 0, event_count: 0 });
  });

  it('claims only pending events and marks publication idempotently', async () => {
    const integrationEvent = event(tenantA);
    await withTenant(tenantA, (client) => outbox.append(client, integrationEvent));

    await withTenant(tenantA, async (client) => {
      const pending = await outbox.claimPending(client, 100);
      expect(pending.map((item) => item.eventId)).toContain(integrationEvent.eventId);
      await expect(outbox.markPublished(client, integrationEvent.eventId)).resolves.toBe(true);
      await expect(outbox.markPublished(client, integrationEvent.eventId)).resolves.toBe(false);
    });

    await withTenant(tenantA, async (client) => {
      const pending = await outbox.claimPending(client, 100);
      expect(pending.map((item) => item.eventId)).not.toContain(integrationEvent.eventId);
    });
  });

  it('skips an event already claimed by another transaction', async () => {
    const integrationEvent = event(tenantA);
    await withTenant(tenantA, (client) => outbox.append(client, integrationEvent));
    const firstClient = await pool.connect();
    const secondClient = await pool.connect();

    try {
      await firstClient.query('BEGIN');
      await firstClient.query('SET LOCAL ROLE transport_rls_test');
      await firstClient.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const firstClaim = await outbox.claimPending(firstClient, 100);
      expect(firstClaim.map((item) => item.eventId)).toContain(integrationEvent.eventId);

      await secondClient.query('BEGIN');
      await secondClient.query('SET LOCAL ROLE transport_rls_test');
      await secondClient.query("SELECT set_config('app.tenant_id', $1, true)", [tenantA]);
      const secondClaim = await outbox.claimPending(secondClient, 100);
      expect(secondClaim.map((item) => item.eventId)).not.toContain(integrationEvent.eventId);
    } finally {
      await firstClient.query('ROLLBACK');
      await secondClient.query('ROLLBACK');
      firstClient.release();
      secondClient.release();
    }
  });

  it('processes a repeated inbox message once and returns the stored result', async () => {
    const messageId = randomUUID();
    messageIds.push(messageId);
    let executions = 0;
    const message = { tenantId: tenantA, consumer: 'integration-test', messageId };

    const first = await withTenant(tenantA, (client) =>
      inbox.processOnce(client, message, async () => {
        executions += 1;
        return { accepted: true };
      }),
    );
    const repeated = await withTenant(tenantA, (client) =>
      inbox.processOnce(client, message, async () => {
        executions += 1;
        return { accepted: false };
      }),
    );

    expect(first).toEqual({ applied: true, result: { accepted: true } });
    expect(repeated).toEqual({ applied: false, result: { accepted: true } });
    expect(executions).toBe(1);
  });

  it('rolls back a failed inbox claim and allows a retry', async () => {
    const messageId = randomUUID();
    const auditId = randomUUID();
    messageIds.push(messageId);
    auditIds.push(auditId);
    const message = { tenantId: tenantA, consumer: 'retry-test', messageId };

    await expect(
      withTenant(tenantA, (client) =>
        inbox.processOnce(client, message, async () => {
          await client.query(
            `INSERT INTO audit.audit_records
              (id, tenant_id, actor_type, action, resource_type)
             VALUES ($1, $2, 'SYSTEM', 'INBOX_EFFECT', 'InboxMessage')`,
            [auditId, tenantA],
          );
          throw new Error('consumer failed');
        }),
      ),
    ).rejects.toThrow('consumer failed');

    await expect(pool.query('SELECT count(*)::int AS count FROM audit.audit_records WHERE id = $1', [auditId]))
      .resolves.toMatchObject({ rows: [{ count: 0 }] });

    const retry = await withTenant(tenantA, (client) =>
      inbox.processOnce(client, message, async () => ({ retried: true } as JsonValue)),
    );
    expect(retry).toEqual({ applied: true, result: { retried: true } });
  });

  it('prevents Tenant A from seeing or publishing Tenant B events', async () => {
    const tenantBEvent = event(tenantB);
    await withTenant(tenantB, (client) => outbox.append(client, tenantBEvent));

    await withTenant(tenantA, async (client) => {
      const pending = await outbox.claimPending(client, 100);
      expect(pending.map((item) => item.eventId)).not.toContain(tenantBEvent.eventId);
      await expect(outbox.markPublished(client, tenantBEvent.eventId)).resolves.toBe(false);
    });
  });

  it('prevents Tenant A from seeing Tenant B inbox records', async () => {
    const messageId = randomUUID();
    messageIds.push(messageId);
    const tenantBMessage = { tenantId: tenantB, consumer: 'tenant-isolation', messageId };
    await withTenant(tenantB, (client) =>
      inbox.processOnce(client, tenantBMessage, async () => ({ tenant: 'B' })),
    );

    await withTenant(tenantA, async (client) => {
      const result = await client.query(
        'SELECT count(*)::int AS count FROM integration.inbox_messages WHERE message_id = $1',
        [messageId],
      );
      expect(result.rows[0]).toEqual({ count: 0 });
    });
  });
});
