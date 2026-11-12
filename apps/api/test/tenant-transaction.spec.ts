import type { Pool, PoolClient } from 'pg';
import { TenantTransaction } from '../src/common/database/tenant-transaction';

describe('TenantTransaction', () => {
  const tenantId = '00000000-0000-0000-0000-000000000001';

  function setup() {
    const client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    } as unknown as PoolClient;
    const pool = {
      connect: jest.fn().mockResolvedValue(client),
    } as unknown as Pool;

    return { client, transaction: new TenantTransaction(pool) };
  }

  it('sets a transaction-local tenant context and commits successful work', async () => {
    const { client, transaction } = setup();
    const work = jest.fn().mockResolvedValue('done');

    await expect(transaction.run(tenantId, work)).resolves.toBe('done');
    expect(client.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      "SELECT set_config('app.tenant_id', $1, true)",
      [tenantId],
    );
    expect(work).toHaveBeenCalledWith(client);
    expect(client.query).toHaveBeenNthCalledWith(3, 'COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('rolls back failed work and always releases the client', async () => {
    const { client, transaction } = setup();
    const failure = new Error('work failed');

    await expect(
      transaction.run(tenantId, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(client.query).toHaveBeenLastCalledWith('ROLLBACK');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
