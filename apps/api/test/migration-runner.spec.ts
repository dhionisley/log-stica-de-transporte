import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Pool, PoolClient } from 'pg';
import {
  calculateChecksum,
  isSelfTransactional,
  loadMigrationFiles,
  maskConnectionString,
  MIGRATION_LOCK_ID,
  MigrationRunner,
} from '../src/tooling/migration-runner';

describe('MigrationRunner Unit Tests', () => {
  describe('calculateChecksum', () => {
    it('calculates sha256 hex string consistently', () => {
      const sum1 = calculateChecksum('SELECT 1;');
      const sum2 = calculateChecksum('SELECT 1;');
      const sum3 = calculateChecksum('SELECT 2;');

      expect(sum1).toBe(sum2);
      expect(sum1).toHaveLength(64);
      expect(sum1).not.toBe(sum3);
    });
  });

  describe('isSelfTransactional', () => {
    it('detects BEGIN; at start of file', () => {
      expect(isSelfTransactional('BEGIN;\nCREATE TABLE t (id int); COMMIT;')).toBe(true);
      expect(isSelfTransactional('  begin  ; \nCREATE TABLE t (id int); COMMIT;')).toBe(true);
      expect(isSelfTransactional('BEGIN TRANSACTION;\nCREATE TABLE t (id int); COMMIT;')).toBe(true);
    });

    it('detects BEGIN; after sql comments', () => {
      const sql = `
        -- initial comment
        /* multi
           line comment */
        BEGIN;
        CREATE TABLE t (id int);
        COMMIT;
      `;
      expect(isSelfTransactional(sql)).toBe(true);
    });

    it('returns false for non-self-transactional sql', () => {
      expect(isSelfTransactional('CREATE TABLE t (id int);')).toBe(false);
      expect(isSelfTransactional('-- just a comment\nCREATE TABLE t (id int);')).toBe(false);
    });
  });

  describe('maskConnectionString', () => {
    it('masks password in postgresql URLs', () => {
      const url = 'error connecting to postgresql://transport_user:super_secret@localhost:5432/transport_db';
      const masked = maskConnectionString(url);
      expect(masked).toBe(
        'error connecting to postgresql://transport_user:***@localhost:5432/transport_db',
      );
    });

    it('masks password in postgres URLs', () => {
      const url = 'FATAL: postgres://app:mypassword@db.host.internal/prod';
      expect(maskConnectionString(url)).toBe(
        'FATAL: postgres://app:***@db.host.internal/prod',
      );
    });

    it('leaves texts without credentials untouched', () => {
      const msg = 'Table platform.tenants does not exist';
      expect(maskConnectionString(msg)).toBe(msg);
    });
  });

  describe('loadMigrationFiles', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('loads and sorts sql files lexicographically', () => {
      fs.writeFileSync(path.join(tmpDir, '0002_second.sql'), 'SELECT 2;');
      fs.writeFileSync(path.join(tmpDir, '0001_first.sql'), 'SELECT 1;');
      fs.writeFileSync(path.join(tmpDir, 'not_sql.txt'), 'IGNORE ME');

      const files = loadMigrationFiles(tmpDir);
      expect(files).toHaveLength(2);
      expect(files[0].name).toBe('0001_first.sql');
      expect(files[0].content).toBe('SELECT 1;');
      expect(files[0].checksum).toBe(calculateChecksum('SELECT 1;'));
      expect(files[1].name).toBe('0002_second.sql');
    });

    it('throws when directory does not exist', () => {
      expect(() => loadMigrationFiles('/non-existent-dir-12345')).toThrow(
        /Migrations directory not found/,
      );
    });
  });

  describe('MigrationRunner Logic with Mocks', () => {
    let mockClient: jest.Mocked<PoolClient>;
    let mockPool: jest.Mocked<Pool>;
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-mock-test-'));
      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      } as unknown as jest.Mocked<PoolClient>;

      mockPool = {
        connect: jest.fn().mockResolvedValue(mockClient),
      } as unknown as jest.Mocked<Pool>;
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('fails when an applied migration checksum differs', async () => {
      fs.writeFileSync(path.join(tmpDir, '0001_initial.sql'), 'SELECT 1;');

      mockClient.query.mockImplementation(async (sql: any) => {
        const queryStr = typeof sql === 'string' ? sql : sql.text;
        if (queryStr.includes('pg_advisory_lock')) return { rows: [] } as any;
        if (queryStr.includes('CREATE TABLE IF NOT EXISTS')) return { rows: [] } as any;
        if (queryStr.includes('SELECT count(*)')) return { rows: [{ count: 1 }] } as any;
        if (queryStr.includes('SELECT name, checksum FROM platform.schema_migrations')) {
          return {
            rows: [{ name: '0001_initial.sql', checksum: 'old-different-checksum' }],
          } as any;
        }
        if (queryStr.includes('pg_advisory_unlock')) return { rows: [] } as any;
        return { rows: [] } as any;
      });

      const runner = new MigrationRunner(mockPool, {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      });

      await expect(runner.run(tmpDir)).rejects.toThrow(
        /Migration checksum mismatch for 0001_initial.sql/,
      );

      expect(mockClient.query).toHaveBeenCalledWith('SELECT pg_advisory_lock($1)', [
        MIGRATION_LOCK_ID,
      ]);
      expect(mockClient.query).toHaveBeenCalledWith('SELECT pg_advisory_unlock($1)', [
        MIGRATION_LOCK_ID,
      ]);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});

