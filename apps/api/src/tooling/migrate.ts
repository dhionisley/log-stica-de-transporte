import * as path from 'node:path';
import { Pool } from 'pg';
import { maskConnectionString, MigrationRunner } from './migration-runner';

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required for migrations.');
    process.exit(1);
  }

  const defaultDir = path.resolve(__dirname, '../../../../infrastructure/migrations');
  const migrationsDirectory = process.env.MIGRATIONS_DIR
    ? path.resolve(process.cwd(), process.env.MIGRATIONS_DIR)
    : defaultDir;

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const runner = new MigrationRunner(pool);
    const result = await runner.run(migrationsDirectory);

    if (result.adoptedMigrations.length > 0) {
      console.log(`Adopted migrations: ${result.adoptedMigrations.join(', ')}`);
    }

    if (result.appliedCount > 0) {
      console.log(
        `Successfully applied ${result.appliedCount} migration(s): ${result.appliedMigrations.join(', ')}`,
      );
    } else {
      console.log('Database schema is already up to date.');
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Migration error: ${maskConnectionString(msg)}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  void main();
}

