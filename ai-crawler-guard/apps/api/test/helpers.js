import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { closePool, query } from '../src/db.js';
import { migrate } from '../src/migrate.js';

/*
 * These tests TRUNCATE every table between cases, so the database they point
 * at must be a throwaway. DATABASE_URL is deliberately NOT inherited: a
 * developer with a .env on their path would otherwise wipe their own data by
 * running `npm test`, which is exactly what happened once during development.
 * Only TEST_DATABASE_URL is honoured, and only if it names a *_test database.
 */
const DEFAULT_TEST_DB = 'postgres://aicg:aicg@127.0.0.1:5432/aicg_test';
const target = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DB;
const databaseName = new URL(target).pathname.replace(/^\//, '');
if (!/_test$/.test(databaseName)) {
  throw new Error(
    `refusing to run destructive tests against "${databaseName}": `
    + 'the test database name must end in "_test". Set TEST_DATABASE_URL.',
  );
}
process.env.DATABASE_URL = target;
process.env.SESSION_SECRET = 'test-secret-that-is-definitely-long-enough';
process.env.NODE_ENV = 'test';
// A stray .env must not redirect the tests at a real database.
delete process.env.CRAWLERS_FILE;

let started = null;

export async function testServer() {
  if (started) return started;
  await migrate({ log: () => {} });
  const app = await createApp({ log: { error: () => {} } });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  started = {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      await closePool();
      started = null;
    },
  };
  return started;
}

export async function reset() {
  await query('TRUNCATE users, sites, bot_events, licensing_inquiries RESTART IDENTITY CASCADE');
}

/** A fetch wrapper that remembers cookies, like a browser session would. */
export function client(base) {
  const jar = new Map();
  return async function call(path, options = {}) {
    const headers = { ...(options.headers ?? {}) };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      options.body = JSON.stringify(options.json);
    }
    const response = await fetch(`${base}${path}`, { ...options, headers, redirect: 'manual' });
    for (const raw of response.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      if (value === '' ) jar.delete(name); else jar.set(name, value);
    }
    const text = await response.text();
    let body = text;
    try { body = JSON.parse(text); } catch { /* keep text */ }
    return { status: response.status, body, text, headers: response.headers };
  };
}

export async function registerOwner(call, email = 'owner@test.local') {
  const response = await call('/auth/register', {
    method: 'POST',
    json: { email, password: 'a-long-enough-password', name: 'Owner' },
  });
  if (response.status !== 201) throw new Error(`register failed: ${response.text}`);
  return response.body.user;
}

export async function createSite(call, name = 'Test Site') {
  const response = await call('/api/sites', { method: 'POST', json: { name, domain: 'test.local' } });
  if (response.status !== 201) throw new Error(`site create failed: ${response.text}`);
  return { site: response.body.site, siteKey: response.body.siteKey };
}

export function withKey(key) {
  return { authorization: `Bearer ${key}` };
}
