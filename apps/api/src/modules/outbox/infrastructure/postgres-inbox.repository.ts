import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import {
  InboxMessage,
  InboxProcessingResult,
  JsonValue,
} from '../application/messaging.types';

interface InboxRow<T extends JsonValue> {
  result: T;
}

@Injectable()
export class PostgresInboxRepository {
  async processOnce<T extends JsonValue>(
    client: PoolClient,
    message: InboxMessage,
    work: () => Promise<T>,
  ): Promise<InboxProcessingResult<T>> {
    const claim = await client.query(
      `INSERT INTO integration.inbox_messages (tenant_id, consumer, message_id, result)
       VALUES ($1, $2, $3, NULL)
       ON CONFLICT (tenant_id, consumer, message_id) DO NOTHING
       RETURNING message_id`,
      [message.tenantId, message.consumer, message.messageId],
    );

    if (claim.rowCount === 1) {
      const result = await work();
      await client.query(
        `UPDATE integration.inbox_messages
         SET result = $4::jsonb, processed_at = now()
         WHERE tenant_id = $1 AND consumer = $2 AND message_id = $3`,
        [message.tenantId, message.consumer, message.messageId, JSON.stringify(result)],
      );
      return { applied: true, result };
    }

    const previous = await client.query<InboxRow<T>>(
      `SELECT result
       FROM integration.inbox_messages
       WHERE tenant_id = $1 AND consumer = $2 AND message_id = $3`,
      [message.tenantId, message.consumer, message.messageId],
    );
    if (previous.rowCount !== 1) {
      throw new Error('Inbox message conflict could not be resolved in the current tenant');
    }
    return { applied: false, result: previous.rows[0].result };
  }
}
