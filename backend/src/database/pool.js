import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

// Liveness does not require a DB connection. Readiness does.
export const pool = env.databaseUrl
  ? new Pool({
      connectionString: env.databaseUrl,
      max: 5,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 30000,
    })
  : null;

export async function isDatabaseReady() {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase() {
  if (pool) await pool.end();
}
