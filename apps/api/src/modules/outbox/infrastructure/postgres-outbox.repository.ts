import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { IntegrationEvent, PendingOutboxEvent } from '../application/messaging.types';

interface OutboxRow {
  id: string;
  tenant_id: string;
  event_type: string;
  schema_version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: string | number;
  correlation_id: string | null;
  causation_id: string | null;
  payload: PendingOutboxEvent['payload'];
  occurred_at: Date;
}

@Injectable()
export class PostgresOutboxRepository {
  async append(client: PoolClient, event: IntegrationEvent): Promise<void> {
    await client.query(
      `INSERT INTO integration.outbox_events (
        id, tenant_id, event_type, schema_version, aggregate_type, aggregate_id,
        aggregate_version, correlation_id, causation_id, payload, occurred_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)`,
      [
        event.eventId,
        event.tenantId,
        event.eventType,
        event.schemaVersion,
        event.aggregateType,
        event.aggregateId,
        event.aggregateVersion,
        event.correlationId ?? null,
        event.causationId ?? null,
        JSON.stringify(event.payload),
        event.occurredAt,
      ],
    );
  }

  async claimPending(client: PoolClient, limit = 50): Promise<PendingOutboxEvent[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000) {
      throw new RangeError('Outbox claim limit must be an integer between 1 and 1000');
    }

    const result = await client.query<OutboxRow>(
      `SELECT id, tenant_id, event_type, schema_version, aggregate_type, aggregate_id,
              aggregate_version, correlation_id, causation_id, payload, occurred_at
       FROM integration.outbox_events
       WHERE published_at IS NULL
       ORDER BY occurred_at, id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [limit],
    );

    return result.rows.map((row) => ({
      eventId: row.id,
      tenantId: row.tenant_id,
      eventType: row.event_type,
      schemaVersion: row.schema_version,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      aggregateVersion: Number(row.aggregate_version),
      correlationId: row.correlation_id ?? undefined,
      causationId: row.causation_id ?? undefined,
      payload: row.payload,
      occurredAt: row.occurred_at,
    }));
  }

  async markPublished(client: PoolClient, eventId: string, publishedAt = new Date()): Promise<boolean> {
    const result = await client.query(
      `UPDATE integration.outbox_events
       SET published_at = $2
       WHERE id = $1 AND published_at IS NULL
       RETURNING id`,
      [eventId, publishedAt],
    );
    return result.rowCount === 1;
  }
}
