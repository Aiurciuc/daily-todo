import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { databaseSettings, loadDatabaseEnvironment } from '../src/database/config';

loadDatabaseEnvironment();
const settings = databaseSettings();
const testName = process.env.TEST_DB_NAME;
if (!testName || testName === settings.database || !/test/i.test(testName)) {
  throw new Error('Set TEST_DB_NAME to a separate migrated disposable test database');
}

describe('calendar migration preserves legacy tasks', () => {
  it('upgrades existing rows without changing titles, dates, completion or order', async () => {
    const pool = new Pool({ ...settings, database: testName });
    const client = await pool.connect();
    const schema = `calendar_migration_test_${randomUUID().replaceAll('-', '')}`;
    const migration = async (name: string) =>
      client.query(
        await readFile(resolve(__dirname, '../prisma/migrations', name, 'migration.sql'), 'utf8'),
      );
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await migration('20261009120000_create_tasks');
      await migration('20261013150000_task_order');
      await client.query(`
        INSERT INTO tasks (title, task_date, completed, position)
        VALUES ('Legacy complete', '2024-10-20', true, 7), ('Legacy open', '0001-01-01', false, 3)
      `);
      const before = await client.query(
        'SELECT id, title, task_date::text, completed, position FROM tasks ORDER BY id',
      );
      await migration('20261015120000_calendar_task_details');
      const after = await client.query(
        'SELECT id, title, task_date::text, completed, position FROM tasks ORDER BY id',
      );
      expect(after.rows).toEqual(before.rows);
      const details = await client.query(
        'SELECT start_minute, duration_minutes, visibility, notes, shared_with FROM tasks',
      );
      expect(details.rows).toEqual(
        Array.from({ length: 2 }, () => ({
          start_minute: null,
          duration_minutes: null,
          visibility: 'PRIVATE',
          notes: null,
          shared_with: null,
        })),
      );
      expect(
        (await client.query("SELECT to_regclass('task_attendees') AS table_name")).rows[0]
          .table_name,
      ).toBeNull();
      const columns = await client.query(
        'SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2',
        [schema, 'tasks'],
      );
      expect(columns.rows.map((row: { column_name: string }) => row.column_name)).not.toContain(
        'call_url',
      );
      expect(columns.rows.map((row: { column_name: string }) => row.column_name)).not.toContain(
        'project',
      );
    } finally {
      // A failed SQL migration may leave its explicit transaction aborted.
      await client.query('ROLLBACK');
      await client.query('SET search_path TO public');
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
