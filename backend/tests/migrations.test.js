import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { assertDedicatedDatabase, runMigrations } from '../src/database/migrate.js';

test('migration guard rejects other databases and roles before DDL', async () => {
  for (const [db, role] of [['hola_maps', 'conspace_app'], ['conspace', 'x_hub_app']]) {
    let writes = 0;
    const client = {
      query: async (sql) => {
        if (sql.startsWith('SELECT current_database')) {
          return { rows: [{ db_name: db, role_name: role }] };
        }
        writes++;
        return { rows: [] };
      },
    };
    await assert.rejects(assertDedicatedDatabase(client), /conspace database/);
    assert.equal(writes, 0);
  }
});

test('migrations are transactional, idempotent and reject edited history', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'conspace-migrations-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = '001_example.sql';
  await writeFile(join(directory, filename), 'SELECT 42;');
  let rows = [];
  let executed = [];
  const client = {
    async query(sql, args) {
      executed.push(sql);
      if (sql.startsWith('SELECT current_database')) {
        return { rows: [{ db_name: 'conspace', role_name: 'conspace_app' }] };
      }
      if (sql.startsWith('SELECT filename')) return { rows };
      if (sql.startsWith('INSERT INTO conspace.schema_migrations')) {
        rows = [...rows, { filename: args[0], sha256: args[1] }];
      }
      return { rows: [] };
    },
    release() {},
  };
  const db = { connect: async () => client };
  assert.deepEqual(await runMigrations(db, directory), { migrations: 1, applied: 1 });
  const count = executed.filter((sql) => sql === 'SELECT 42;').length;
  assert.equal(count, 1);
  assert.deepEqual(await runMigrations(db, directory), { migrations: 1, applied: 0 });
  assert.equal(executed.filter((sql) => sql === 'SELECT 42;').length, count);
  await writeFile(join(directory, filename), 'SELECT 99;');
  await assert.rejects(runMigrations(db, directory), /modified/);
  assert.equal(executed.at(-1), 'ROLLBACK');
});

test('migration refuses when no connection is supplied', async () => {
  await assert.rejects(runMigrations(null), /DATABASE_URL is required/);
});


test('IA v1.0 migration preserves legacy admin access and creates explicit permission grants without destructive DDL',async()=>{
 const sql=await readFile(new URL('../src/database/migrations/004_ia_governance.sql',import.meta.url),'utf8');
 const templateA=await readFile(new URL('../src/database/migrations/002_cms_editorial.sql',import.meta.url),'utf8');
 assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS conspace.cms_user_roles'));
 assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS conspace.cms_user_permissions'));
 assert.ok(sql.includes('CONTENT_PUBLISH'));assert.ok(sql.includes('CONTENT_WITHDRAW'));
 assert.ok(sql.includes('LEGACY_ADMIN_COMPAT'));assert.ok(sql.includes('ADD COLUMN IF NOT EXISTS person_id'));
 assert.ok(sql.includes("THEN 'TEMPLATE_B'"));
 assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS conspace.architectural_template_blocks'));
 assert.match(sql,/section_no BETWEEN 1 AND 7/);assert.match(templateA,/section_no BETWEEN 1 AND 12/);
 assert.ok(!/DROP TABLE|TRUNCATE|DELETE FROM conspace\\./i.test(sql));
});
