/**
 * A demo site with the guard mounted.
 *
 *   node server.js
 *
 * With AICG_API_URL and AICG_SITE_KEY set it reports to the hosted API and
 * polls it for the policy. Without them it runs entirely standalone: the
 * policy below applies and every bot hit is printed to the console. That
 * offline mode is a real supported deployment, not just a demo shortcut - a
 * site owner who only wants visibility never has to run the API at all.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { configFromEnv, createAiCrawlerGuard } from 'ai-crawler-guard';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);
const ORIGIN = process.env.PUBLIC_URL ?? `http://localhost:${PORT}`;
const env = configFromEnv();
const standalone = !env.reporting;

const guard = await createAiCrawlerGuard({
  ...env,

  // Local policy. When the hosted API is configured this is only the starting
  // point and the fallback: the policy from the dashboard wins, and this is
  // what the middleware keeps enforcing if the API is unreachable.
  policy: {
    defaultAction: 'log',
    onSpoofed: 'block',
    rules: {
      gptbot: 'block',
      ccbot: 'block',
      bytespider: 'block',
      claudebot: { action: 'license' },
      googlebot: 'allow',
      applebot: 'allow',
      'claude-user': { action: 'allow', paths: [{ match: '/premium/', action: 'license' }] },
    },
  },

  robots: {
    serve: true,
    sitemaps: [`${ORIGIN}/sitemap.xml`],
    existing: await readFile(join(here, 'robots.txt'), 'utf8'),
  },

  licensing: {
    publicUrl: ORIGIN,
    branding: {
      siteName: 'Example Press',
      contactEmail: 'licensing@example.com',
      intro: 'Example Press publishes original reporting. Automated collection is '
        + 'available under licence; tell us what you need and we will reply by email.',
    },
    // Only needed when the hosted API is not configured.
    onInquiry: standalone
      ? async (inquiry) => console.log('[inquiry]', JSON.stringify(inquiry, null, 2))
      : undefined,
  },

  reporting: standalone
    ? { sink: async (events) => { for (const e of events) console.log('[bot]', e.botId, e.verification, e.action, e.path); }, batchSize: 1, flushIntervalMs: 0 }
    : env.reporting,

  onError: (error) => console.error('[ai-crawler-guard]', error.message),
});

const app = express();
app.use(guard.express());

app.get('/', (req, res) => res.type('html').send(page('Example Press', `
  <p>An ordinary page. Try fetching it as a crawler:</p>
  <pre>curl -A 'GPTBot/1.2' ${ORIGIN}/
curl -A 'ClaudeBot/1.0' ${ORIGIN}/
curl ${ORIGIN}/robots.txt
curl -H 'accept: application/json' ${ORIGIN}/.well-known/ai-licensing</pre>
  <p><a href="/premium/report">A premium page</a> &middot; <a href="/robots.txt">robots.txt</a></p>
`)));

app.get('/premium/report', (req, res) => res.type('html').send(page('The 2026 report', '<p>Premium content.</p>')));
app.get('/sitemap.xml', (req, res) => res.type('application/xml').send(
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${ORIGIN}/</loc></url></urlset>`,
));

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>`
    + `<body style="font:16px/1.6 system-ui;max-width:42rem;margin:4rem auto;padding:0 1rem">`
    + `<h1>${title}</h1>${body}</body>`;
}

app.listen(PORT, () => {
  console.log(`example site on ${ORIGIN}`);
  console.log(standalone
    ? 'standalone mode: bot hits print here, inquiries print here'
    : `reporting to ${process.env.AICG_API_URL}`);
});
