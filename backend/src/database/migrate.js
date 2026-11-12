import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { pool, closeDatabase } from './pool.js';

const migrationDirectory = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

// Refuse to migrate any database used by another application.
export async function assertDedicatedDatabase(client) {
  const result = await client.query(
    'SELECT current_database() AS db_name, current_user AS role_name'
  );
  if (result.rows[0]?.db_name !== 'conspace' || result.rows[0]?.role_name !== 'conspace_app') {
    throw new Error('Migrations/seeds require conspace database and conspace_app role');
  }
}

export async function runMigrations(db = pool, directory = migrationDirectory) {
  if (!db) throw new Error('DATABASE_URL is required for migrations');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await assertDedicatedDatabase(client);
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [19027, 1]);
    await client.query('CREATE SCHEMA IF NOT EXISTS conspace');
    await client.query(
      'CREATE TABLE IF NOT EXISTS conspace.schema_migrations ' +
      '(filename text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())'
    );

    const files = (await readdir(directory)).filter((name) => /^[0-9]{3}_[a-z0-9_]+\.sql$/.test(name)).sort();
    const applied = await client.query('SELECT filename, sha256 FROM conspace.schema_migrations');
    const checksums = new Map(applied.rows.map((row) => [row.filename, row.sha256]));

    for (const filename of files) {
      const sql = await readFile(join(directory, filename), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (checksums.has(filename)) {
        if (checksums.get(filename) !== checksum) {
          throw new Error('Previously applied migration was modified: ' + filename);
        }
        continue;
      }
      await client.query(sql);
      await client.query(
        'INSERT INTO conspace.schema_migrations (filename, sha256) VALUES ($1, $2)',
        [filename, checksum]
      );
    }

    for (const filename of checksums.keys()) {
      if (!files.includes(filename)) {
        throw new Error('Applied migration missing from repository: ' + filename);
      }
    }
    await client.query('COMMIT');
    return { migrations: files.length, applied: files.filter((name) => !checksums.has(name)).length };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMigrations().then((result) => {
    console.log('CONSPACE migrations:', result);
  }).catch((error) => {
    console.error('CONSPACE migration failed:', error.message);
    process.exitCode = 1;
  }).finally(() => closeDatabase());
}
