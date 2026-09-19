import { createGuard } from '@ai-crawler-guard/core';
import { createExpressMiddleware } from './express.js';
import { fastifyAiCrawlerGuard } from './fastify.js';
import { createNextMiddleware } from './next.js';
import { createNodeHandler } from './node.js';

/**
 * Build a guard and hand back adapters for whichever framework you run.
 *
 *   const guard = await createAiCrawlerGuard({ ... });
 *   app.use(guard.express());
 *
 * @returns {Promise<object>} the core guard, plus `.express()`, `.node()`,
 *   `.next()` and `.fastify` (a plugin, register it with `{ guard }`).
 */
export async function createAiCrawlerGuard(options = {}) {
  const guard = await createGuard(options);
  const onError = options.onError ?? (() => {});
  return Object.assign(guard, {
    express: (opts = {}) => createExpressMiddleware(guard, { onError, ...opts }),
    node: (opts = {}) => createNodeHandler(guard, { onError, ...opts }),
    next: (opts = {}) => createNextMiddleware(guard, { onError, ...opts }),
    fastify: fastifyAiCrawlerGuard,
    fastifyOptions: { guard },
  });
}

/**
 * Express-shaped convenience: returns middleware synchronously and finishes
 * initialising in the background.
 *
 * Requests that arrive before the catalog has loaded wait for it. If
 * initialisation fails outright the middleware passes every request through
 * and reports the error: a misconfigured bot policy is a problem, but it is
 * not a reason for the site to stop serving pages.
 */
export function aiCrawlerGuard(options = {}) {
  const onError = options.onError ?? ((error) => {
    console.error('[ai-crawler-guard] initialisation failed; passing traffic through:', error.message);
  });
  let guard = null;
  const ready = createGuard(options)
    .then((instance) => {
      guard = instance;
      return instance;
    })
    .catch((error) => {
      onError(error);
      return null;
    });

  const middleware = async (req, res, next) => {
    if (!guard) await ready;
    if (!guard) return next();
    return createExpressMiddleware(guard, { onError })(req, res, next);
  };
  middleware.ready = ready;
  middleware.guard = () => guard;
  middleware.close = async () => {
    await ready;
    await guard?.close();
  };
  return middleware;
}

/**
 * Read the standard environment variables into a config fragment, so the same
 * code works in development (no hosted API) and production (hosted API) with
 * no branching in the app.
 */
export function configFromEnv(env = process.env) {
  const config = {};
  if (env.AICG_SITE_ID) config.siteId = env.AICG_SITE_ID;
  if (env.AICG_API_URL && env.AICG_SITE_KEY) {
    config.reporting = { endpoint: env.AICG_API_URL, siteKey: env.AICG_SITE_KEY };
    config.policySource = {
      url: new URL('/v1/policy', env.AICG_API_URL).toString(),
      siteKey: env.AICG_SITE_KEY,
      refreshMs: Number(env.AICG_POLICY_REFRESH_MS ?? 60_000),
    };
    config.catalog = {
      source: new URL('/v1/crawlers', env.AICG_API_URL).toString(),
      siteKey: env.AICG_SITE_KEY,
      refreshMs: Number(env.AICG_CATALOG_REFRESH_MS ?? 6 * 60 * 60 * 1000),
    };
  }
  if (env.AICG_CRAWLERS_FILE) config.catalog = { source: env.AICG_CRAWLERS_FILE };
  if (env.AICG_TRUST_PROXY) config.trustProxy = parseTrustProxy(env.AICG_TRUST_PROXY);
  if (env.AICG_LOG_IP) config.logIp = env.AICG_LOG_IP;
  if (env.AICG_FETCH_RANGES === 'true') config.verification = { fetchRanges: true };
  return config;
}

function parseTrustProxy(value) {
  if (value === 'false' || value === '') return false;
  if (value === 'true') return true;
  if (/^\d+$/.test(value)) return Number(value);
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

export { createExpressMiddleware, createNextMiddleware, createNodeHandler, fastifyAiCrawlerGuard };
export { writeNodeResponse, toRequestDescriptor } from './node.js';
export { toWebRequestDescriptor } from './next.js';
export * from '@ai-crawler-guard/core';
