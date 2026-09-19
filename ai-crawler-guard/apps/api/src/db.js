import pg from 'pg';

// Timestamps come back as ISO strings rather than local-time Date objects, so
// the API serialises the same value it stored regardless of server timezone.
pg.types.setTypeParser(pg.types.builtins.TIMESTAMPTZ, (value) => new Date(value).toISOString());
// bigint ids would lose precision as JS numbers; keep them as strings.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => value);

let pool = null;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    pool = new pg.Pool({
      connectionString,
      max: Number(process.env.PGPOOL_MAX ?? 10),
      idleTimeoutMillis: 30_000,
      ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
    });
    pool.on('error', (error) => console.error('[db] idle client error:', error.message));
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
