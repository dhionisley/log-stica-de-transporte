import { Module } from '@nestjs/common';
import { PostgresInboxRepository } from './infrastructure/postgres-inbox.repository';
import { PostgresOutboxRepository } from './infrastructure/postgres-outbox.repository';

@Module({
  providers: [PostgresOutboxRepository, PostgresInboxRepository],
  exports: [PostgresOutboxRepository, PostgresInboxRepository],
})
export class OutboxModule {}
