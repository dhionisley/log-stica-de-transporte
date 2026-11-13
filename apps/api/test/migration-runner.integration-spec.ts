import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Pool } from 'pg';
import {
  calculateChecksum,
  MigrationRunner,
} from '../src/tooling/migration-runner';

const baseConnectionString =
  process.env.TEST_DATABASE_URL ??
  'postgresql://transport:transport@127.0.0.1:5432/transport';

function getDbUrlForDatabase(dbName: string): string {
  const url = new URL(baseConnectionString);
  url.pathname = `/${dbName}`;
  return url.toString();
}

describe('MigrationRunner Integration', () => {
  const adminPool = new Pool({ connectionString: baseConnectionString });
  const realMigrationsDir = path.resolve(
    __dirname,
    '../../../infrastructure/migrations',
  );

  const testDbName = `test_migrate_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  let testPool: Pool;

  beforeAll(async () => {
    await adminPool.query(`CREATE DATABASE ${testDbName}`);
    testPool = new Pool({ connectionString: getDbUrlForDatabase(testDbName) });
  });

  afterAll(async () => {
    if (testPool) {
      await testPool.end();
    }
    // Força desconexões do banco temporário antes de dropar
    await adminPool.query(`
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = '${testDbName}' AND pid <> pg_backend_pid();
    `);
    await adminPool.query(`DROP DATABASE IF EXISTS ${testDbName}`);
    await adminPool.end();
  });

  it('applies migrations to a clean database and tracks them in platform.schema_migrations', async () => {
    const runner = new MigrationRunner(testPool, {
      log: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    });

    const result = await runner.run(realMigrationsDir);

    expect(result.appliedCount).toBeGreaterThanOrEqual(1);
    expect(result.appliedMigrations).toContain('0001_foundation.sql');

    const expectedFiles = fs
      .readdirSync(realMigrationsDir)
      .filter((f) => f.endsWith('.sql'));

    const checkRes = await testPool.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM platform.schema_migrations ORDER BY name',
    );
    expect(checkRes.rows).toHaveLength(expectedFiles.length);

    const appliedNames = checkRes.rows.map((r) => r.name);
    expect(appliedNames).toContain('0001_foundation.sql');

    const expectedChecksum = calculateChecksum(
      fs.readFileSync(path.join(realMigrationsDir, '0001_foundation.sql'), 'utf8'),
    );
    expect(checkRes.rows[0].checksum).toBe(expectedChecksum);

    // Confirma que as tabelas do schema foram de fato criadas
    const tablesRes = await testPool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'platform'`,
    );
    const tableNames = tablesRes.rows.map((r) => r.table_name);
    expect(tableNames).toContain('tenants');
    expect(tableNames).toContain('schema_migrations');
  });

  it('is idempotent and applies nothing on re-execution', async () => {
    const runner = new MigrationRunner(testPool, {
      log: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    });

    const result = await runner.run(realMigrationsDir);
    expect(result.appliedCount).toBe(0);
    expect(result.appliedMigrations).toHaveLength(0);
  });

  it('fails and halts when an applied migration has a modified checksum', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tampered-migration-'));
    try {
      // Cria 0001 com conteúdo adulterado
      fs.writeFileSync(
        path.join(tmpDir, '0001_foundation.sql'),
        '-- TAMPERED CONTENT\nSELECT 1;',
      );

      const runner = new MigrationRunner(testPool, {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      });

      await expect(runner.run(tmpDir)).rejects.toThrow(
        /Migration checksum mismatch for 0001_foundation.sql/,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rolls back failed pending migrations and does not record them in schema_migrations', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'broken-migration-'));
    try {
      // Copia 0001 válida intacta
      const origContent = fs.readFileSync(
        path.join(realMigrationsDir, '0001_foundation.sql'),
        'utf8',
      );
      fs.writeFileSync(path.join(tmpDir, '0001_foundation.sql'), origContent);

      // Adiciona 0002 com erro sintático
      fs.writeFileSync(
        path.join(tmpDir, '0002_failing.sql'),
        'CREATE TABLE broken_table (syntax error here!!!);',
      );

      const runner = new MigrationRunner(testPool, {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      });

      await expect(runner.run(tmpDir)).rejects.toThrow();

      const res = await testPool.query<{ name: string }>(
        'SELECT name FROM platform.schema_migrations',
      );
      const recorded = res.rows.map((r) => r.name);
      expect(recorded).not.toContain('0002_failing.sql');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('adopts existing database with tables but without schema_migrations tracking', async () => {
    const adoptionDb = `test_adopt_${Date.now()}`;
    await adminPool.query(`CREATE DATABASE ${adoptionDb}`);
    const adoptionPool = new Pool({
      connectionString: getDbUrlForDatabase(adoptionDb),
    });

    const adoptionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'adoption-test-'));

    try {
      // Simula banco migrado manualmente antes do runner existir (apenas 0001)
      const origSql = fs.readFileSync(
        path.join(realMigrationsDir, '0001_foundation.sql'),
        'utf8',
      );
      await adoptionPool.query(origSql);
      fs.writeFileSync(path.join(adoptionDir, '0001_foundation.sql'), origSql);

      // Executa o runner
      const runner = new MigrationRunner(adoptionPool, {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      });

      const result = await runner.run(adoptionDir);
      expect(result.adoptedMigrations).toContain('0001_foundation.sql');
      expect(result.appliedCount).toBe(0);

      // Verifica que foi registrado na tabela de controle
      const record = await adoptionPool.query<{ name: string }>(
        'SELECT name FROM platform.schema_migrations WHERE name = $1',
        ['0001_foundation.sql'],
      );
      expect(record.rows).toHaveLength(1);
    } finally {
      fs.rmSync(adoptionDir, { recursive: true, force: true });
      await adoptionPool.end();
      await adminPool.query(`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE datname = '${adoptionDb}' AND pid <> pg_backend_pid();
      `);
      await adminPool.query(`DROP DATABASE IF EXISTS ${adoptionDb}`);
    }
  });
});

