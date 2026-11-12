import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Pool, PoolClient } from 'pg';

export interface MigrationFile {
  name: string;
  path: string;
  content: string;
  checksum: string;
}

export interface MigrationExecutionResult {
  appliedCount: number;
  appliedMigrations: string[];
  adoptedMigrations: string[];
}

export const MIGRATION_LOCK_ID = 84729104;

export function calculateChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function stripSqlComments(sql: string): string {
  // Remove comentários de linha (-- ...) e de bloco (/* ... */)
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .trim();
}

export function isSelfTransactional(content: string): boolean {
  const stripped = stripSqlComments(content);
  return /^begin(?:\s+transaction)?\s*;/i.test(stripped);
}

export function maskConnectionString(text: string): string {
  return text.replace(
    /(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi,
    '$1***$3',
  );
}

export function loadMigrationFiles(directory: string): MigrationFile[] {
  if (!fs.existsSync(directory)) {
    throw new Error(`Migrations directory not found: ${directory}`);
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort();

  return sqlFiles.map((name) => {
    const fullPath = path.join(directory, name);
    const content = fs.readFileSync(fullPath, 'utf8');
    return {
      name,
      path: fullPath,
      content,
      checksum: calculateChecksum(content),
    };
  });
}

export class MigrationRunner {
  constructor(
    private readonly pool: Pool,
    private readonly logger: {
      log: (msg: string) => void;
      warn: (msg: string) => void;
      error: (msg: string) => void;
    } = console,
  ) {}

  async run(migrationsDirectory: string): Promise<MigrationExecutionResult> {
    const files = loadMigrationFiles(migrationsDirectory);
    const client = await this.pool.connect();

    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);

      await this.ensureMigrationsTable(client);

      const adoptedMigrations = await this.handleAdoption(client, files);
      await this.verifyAppliedIntegrity(client, files);

      const appliedMigrations = await this.applyPendingMigrations(client, files);

      return {
        appliedCount: appliedMigrations.length,
        appliedMigrations,
        adoptedMigrations,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const safeMessage = maskConnectionString(message);
      this.logger.error(`Migration execution failed: ${safeMessage}`);
      throw new Error(safeMessage);
    } finally {
      try {
        await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
      } catch {
        // Ignora erro ao destravar caso conexão tenha caído
      }
      client.release();
    }
  }

  private async ensureMigrationsTable(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS platform;
      CREATE TABLE IF NOT EXISTS platform.schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);
  }

  private async handleAdoption(
    client: PoolClient,
    files: MigrationFile[],
  ): Promise<string[]> {
    const countRes = await client.query<{ count: string }>(
      'SELECT count(*)::int as count FROM platform.schema_migrations',
    );
    const totalApplied = Number(countRes.rows[0]?.count ?? 0);

    if (totalApplied > 0) {
      return [];
    }

    const tableCheckRes = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'platform' AND table_name = 'tenants'
      ) as exists
    `);
    const tenantsExist = Boolean(tableCheckRes.rows[0]?.exists);

    const adopted: string[] = [];
    if (tenantsExist) {
      const foundationFile = files.find((f) => f.name === '0001_foundation.sql');
      if (foundationFile) {
        await client.query(
          'INSERT INTO platform.schema_migrations (name, checksum) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [foundationFile.name, foundationFile.checksum],
        );
        adopted.push(foundationFile.name);
        this.logger.warn(
          `[migration-runner] Detected existing schema without migration tracking. Adopted ${foundationFile.name}.`,
        );
      }
    }

    return adopted;
  }

  private async verifyAppliedIntegrity(
    client: PoolClient,
    files: MigrationFile[],
  ): Promise<void> {
    const res = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM platform.schema_migrations ORDER BY name',
    );

    const fileMap = new Map(files.map((f) => [f.name, f]));

    for (const row of res.rows) {
      const file = fileMap.get(row.name);
      if (!file) {
        throw new Error(
          `Applied migration ${row.name} is missing from migrations directory`,
        );
      }

      if (file.checksum !== row.checksum) {
        throw new Error(
          `Migration checksum mismatch for ${file.name}. Expected ${row.checksum}, but file has ${file.checksum}. Applied migrations are immutable.`,
        );
      }
    }
  }

  private async applyPendingMigrations(
    client: PoolClient,
    files: MigrationFile[],
  ): Promise<string[]> {
    const res = await client.query<{ name: string }>(
      'SELECT name FROM platform.schema_migrations',
    );
    const appliedSet = new Set(res.rows.map((r) => r.name));

    const pending = files.filter((f) => !appliedSet.has(f.name));
    if (pending.length === 0) {
      this.logger.log('No pending migrations. Database is up to date.');
      return [];
    }

    const applied: string[] = [];

    for (const file of pending) {
      this.logger.log(`Applying migration: ${file.name}`);

      if (isSelfTransactional(file.content)) {
        await client.query(file.content);
        await client.query(
          'INSERT INTO platform.schema_migrations (name, checksum) VALUES ($1, $2)',
          [file.name, file.checksum],
        );
      } else {
        await client.query('BEGIN');
        try {
          await client.query(file.content);
          await client.query(
            'INSERT INTO platform.schema_migrations (name, checksum) VALUES ($1, $2)',
            [file.name, file.checksum],
          );
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }

      applied.push(file.name);
    }

    return applied;
  }
}

