import './env.js';
import { createApp } from './app.js';
import { closePool } from './db.js';
import { migrate } from './migrate.js';
import { mailerConfigured } from './mailer.js';
import { sessionSecret } from './auth.js';

const port = Number(process.env.PORT ?? 4000);

async function main() {
  sessionSecret(); // fail fast on a missing or weak secret
  if (process.env.MIGRATE_ON_BOOT !== 'false') {
    await migrate({ log: (line) => console.log(`[migrate] ${line}`) });
  }
  const app = await createApp();
  const server = app.listen(port, () => {
    console.log(`[api] listening on :${port}`);
    if (!mailerConfigured()) {
      console.log('[api] SMTP not configured - licensing inquiries will be stored and shown in the dashboard only.');
    }
  });

  const shutdown = async (signal) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch(async (error) => {
  console.error('[api] failed to start:', error.message);
  await closePool();
  process.exit(1);
});
