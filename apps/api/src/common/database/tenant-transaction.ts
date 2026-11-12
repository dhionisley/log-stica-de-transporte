import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export class TenantTransaction {
  constructor(private readonly pool: Pool) {}

  async run<T>(tenantId: string, work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // set_config(..., true) is transaction-local and parameterizable.
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

  query<T extends QueryResultRow = QueryResultRow>(client: PoolClient, sql: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return client.query<T>(sql, values);
  }
}
