#!/usr/bin/env node
/** Plain SQL migrations, applied in filename order and recorded in a table. */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './env.js';
import { closePool, getPool } from './db.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate({ log = console.log } = {}) {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const applied = new Set(
    (await pool.query('SELECT name FROM schema_migrations')).rows.map((row) => row.name),
  );
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`  applied ${file}`);
      count++;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`migration ${file} failed: ${error.message}`, { cause: error });
    } finally {
      client.release();
    }
  }
  log(count ? `${count} migration(s) applied.` : 'Database is up to date.');
  return count;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then(() => closePool())
    .catch(async (error) => {
      console.error(error.message);
      await closePool();
      process.exit(1);
    });
}
