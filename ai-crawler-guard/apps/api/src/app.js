import express from 'express';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { ingestRouter } from './routes/ingest.js';
import { loadCatalog } from './catalog.js';
import { HttpError } from './validate.js';

/**
 * Minimal CORS, for the case where the dashboard is served from a different
 * origin than the API. Credentials are cookies, so the allow-list is exact
 * origins only - never a wildcard.
 */
function cors(allowedOrigins) {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.get('origin');
    if (origin && allowed.has(origin)) {
      res.set('access-control-allow-origin', origin);
      res.set('access-control-allow-credentials', 'true');
      res.set('vary', 'Origin');
      res.set('access-control-allow-headers', 'content-type, authorization');
      res.set('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  };
}

/** Coarse per-key limiter, enough to stop a broken client hammering ingest. */
function rateLimit({ windowMs = 60_000, max = 600 } = {}) {
  const buckets = new Map();
  return (req, res, next) => {
    const key = req.get('authorization') ?? req.ip;
    const now = Date.now();
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      if (buckets.size > 10_000) {
        for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      }
      return next();
    }
    bucket.count++;
    if (bucket.count > max) {
      res.set('retry-after', String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ error: 'rate_limited' });
    }
    return next();
  };
}

/**
 * TRUST_PROXY arrives as a string, and Express hands anything it does not
 * recognise straight to proxy-addr, which throws on "false". Parse it here.
 */
function parseTrustProxy(value) {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export async function createApp({ log = console } = {}) {
  await loadCatalog();

  const app = express();
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  app.disable('x-powered-by');

  const origins = (process.env.CORS_ORIGINS ?? process.env.DASHBOARD_URL ?? '')
    .split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length) app.use(cors(origins));

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

  app.use('/v1', rateLimit({ max: Number(process.env.INGEST_RATE_LIMIT ?? 600) }), ingestRouter);
  app.use('/auth', rateLimit({ max: 60 }), authRouter);
  app.use('/api', dashboardRouter);

  app.use((req, res) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ error: error.code, details: error.details });
    }
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    log.error('[api]', error);
    return res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
