/**
 * The engine.
 *
 * Deliberately knows nothing about Express, Fastify, Next or Node's http
 * module. It takes a plain description of a request and returns a decision,
 * optionally with a ready-made response to write. Every adapter in the
 * middleware package is a thin translation layer over this, and a reverse
 * proxy is the same translation over a different socket - which is why the
 * hosting model can change later without touching any of this.
 */
import { createHash, randomBytes } from 'node:crypto';
import { CatalogStore, compileCatalog } from './catalog.js';
import { detect } from './detect.js';
import { createPolicy, DEFAULT_POLICY } from './policy.js';
import { createVerifier, RangeStore, UNKNOWN } from './verify.js';
import { buildRobotsTxt } from './robots.js';
import {
  licensingDescriptor,
  parseInquiry,
  renderInquiryReceived,
  renderLicensingPage,
} from './licensing.js';
import { createReporter } from './reporter.js';
import { RemoteValue, fetchJson } from './remote.js';
import { headerValue, resolveClientIp } from './ip.js';
import { ConfigError } from './errors.js';

const DEFAULTS = {
  trustProxy: false,
  robotsPath: '/robots.txt',
  licensingPath: '/.well-known/ai-licensing',
  inquiryPath: '/.well-known/ai-licensing/inquiry',
  blockStatus: 403,
  licensingStatus: 403,
  logIp: 'store',
};

function toPathname(url) {
  if (typeof url !== 'string' || !url) return '/';
  if (url.startsWith('/')) {
    const cut = url.search(/[?#]/);
    return cut === -1 ? url : url.slice(0, cut);
  }
  try {
    return new URL(url).pathname;
  } catch {
    return '/';
  }
}

function hashIp(ip, salt) {
  return `sha256:${createHash('sha256').update(`${salt}${ip}`).digest('hex').slice(0, 32)}`;
}

/** Sliding-window limiter for the public inquiry form. */
function createRateLimiter({ max = 5, windowMs = 60 * 60 * 1000, now = Date.now } = {}) {
  const hits = new Map();
  return {
    take(key) {
      if (!key) return true;
      const cutoff = now() - windowMs;
      const list = (hits.get(key) ?? []).filter((t) => t > cutoff);
      if (list.length >= max) {
        hits.set(key, list);
        return false;
      }
      list.push(now());
      hits.set(key, list);
      if (hits.size > 10_000) {
        for (const [k, v] of hits) {
          if (!v.some((t) => t > cutoff)) hits.delete(k);
          if (hits.size <= 5_000) break;
        }
      }
      return true;
    },
  };
}

function textResponse(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
    body,
  };
}

function htmlResponse(status, body, extraHeaders = {}) {
  return {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
    body,
  };
}

function jsonResponse(status, value, extraHeaders = {}) {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(value, null, 2),
  };
}

export async function createGuard(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const onError = config.onError ?? (() => {});

  // ---- catalog -------------------------------------------------------------
  const catalogSource = config.catalog?.source ?? config.catalog ?? 'default';
  const catalogIsRemote = typeof catalogSource === 'string' && /^https?:\/\//i.test(catalogSource);
  const catalogStore = new CatalogStore({
    source: catalogSource,
    refreshMs: config.catalog?.refreshMs ?? 0,
    fetchImpl: config.fetchImpl,
    headers: config.catalog?.headers
      ?? (config.catalog?.siteKey ? { authorization: `Bearer ${config.catalog.siteKey}` } : undefined),
    // A hosted catalog is a convenience, not a dependency: if it is
    // unreachable the bundled list is used and the site still boots.
    fallbackToDefault: config.catalog?.fallbackToDefault ?? catalogIsRemote,
    onError,
  });
  await catalogStore.load();

  // ---- policy --------------------------------------------------------------
  const localPolicyConfig = config.policy ?? DEFAULT_POLICY;
  const buildPolicy = (raw) => createPolicy(raw, { catalog: catalogStore.current });
  let policyRemote = null;

  if (config.policySource?.url) {
    const { url, siteKey, refreshMs = 60_000, timeoutMs = 5_000 } = config.policySource;
    policyRemote = new RemoteValue({
      refreshMs,
      onError,
      fallback: buildPolicy(localPolicyConfig),
      load: async () => {
        const doc = await fetchJson(url, {
          fetchImpl: config.fetchImpl,
          timeoutMs,
          headers: siteKey ? { authorization: `Bearer ${siteKey}` } : {},
        });
        return buildPolicy(doc.policy ?? doc);
      },
    });
    await policyRemote.init();
  }

  let localPolicy = buildPolicy(localPolicyConfig);
  const getPolicy = () => (policyRemote ? policyRemote.current : localPolicy);

  // ---- verification --------------------------------------------------------
  const verifyConfig = config.verification ?? {};
  const rangeStore = new RangeStore({
    enabled: verifyConfig.fetchRanges === true,
    fetchImpl: config.fetchImpl,
    onError,
  });
  const verifier = verifyConfig.verifier ?? createVerifier({
    resolver: verifyConfig.resolver,
    timeoutMs: verifyConfig.timeoutMs ?? 1500,
    cacheMax: verifyConfig.cacheMax ?? 10_000,
    ttl: verifyConfig.ttl,
    rangeStore,
    onError,
  });
  const verificationMode = verifyConfig.mode ?? 'blocking';
  if (!['blocking', 'background'].includes(verificationMode)) {
    throw new ConfigError(`verification.mode must be "blocking" or "background", got ${JSON.stringify(verificationMode)}`);
  }

  // ---- reporting -----------------------------------------------------------
  const reporter = config.reporting === false
    ? createReporter({})
    : createReporter({ fetchImpl: config.fetchImpl, onError, ...(config.reporting ?? {}) });

  // ---- licensing -----------------------------------------------------------
  const licensing = { enabled: true, ...(config.licensing ?? {}) };
  const branding = licensing.branding ?? {};
  const inquiryLimiter = createRateLimiter(licensing.rateLimit ?? {});
  const ipSalt = config.ipSalt ?? randomBytes(16).toString('hex');

  const paths = {
    robots: config.robots?.path ?? DEFAULTS.robotsPath,
    licensing: licensing.path ?? DEFAULTS.licensingPath,
    inquiry: licensing.inquiryPath ?? DEFAULTS.inquiryPath,
  };
  const reserved = new Set(Object.values(paths));

  function presentIp(ip) {
    if (!ip) return null;
    if (config.logIp === 'none') return null;
    if (config.logIp === 'hash') return hashIp(ip, ipSalt);
    return ip;
  }

  function robotsBody() {
    const existing = typeof config.robots?.existing === 'function'
      ? config.robots.existing()
      : config.robots?.existing ?? '';
    return buildRobotsTxt({
      catalog: catalogStore.current,
      policy: getPolicy(),
      existing,
      licensingUrl: licensing.enabled ? licensing.publicUrl ?? null : null,
      sitemaps: config.robots?.sitemaps ?? [],
    });
  }

  function policySummary() {
    const policy = getPolicy();
    return catalogStore.current.crawlers.map((crawler) => ({
      id: crawler.id,
      name: crawler.name,
      operator: crawler.operator,
      purpose: crawler.purpose,
      robotsToken: crawler.robotsToken,
      robotsOnly: crawler.robotsOnly,
      action: policy.actionFor(crawler),
    }));
  }

  async function handleInquiry(request, clientIp) {
    if (!licensing.enabled) return textResponse(404, 'Not found\n');
    if (!inquiryLimiter.take(clientIp)) {
      return textResponse(429, 'Too many inquiries from this address. Try again later.\n');
    }
    let raw = request.body;
    if (raw === undefined && typeof request.readBody === 'function') {
      raw = await request.readBody();
    }
    if (typeof raw === 'string') {
      const contentType = headerValue(request.headers, 'content-type') ?? '';
      if (contentType.includes('application/json')) {
        try {
          raw = JSON.parse(raw);
        } catch {
          raw = {};
        }
      } else {
        raw = Object.fromEntries(new URLSearchParams(raw));
      }
    }

    const wantsJson = (headerValue(request.headers, 'accept') ?? '').includes('application/json');
    const result = parseInquiry(raw);
    const crawler = result.value.crawlerId
      ? catalogStore.current.byId.get(result.value.crawlerId) ?? null
      : null;

    if (!result.ok) {
      if (result.spam) {
        // Answer a honeypot hit exactly like a success so the spammer learns
        // nothing, but drop it on the floor.
        return wantsJson
          ? jsonResponse(202, { status: 'received' })
          : htmlResponse(202, renderInquiryReceived({ branding }));
      }
      if (wantsJson) return jsonResponse(400, { status: 'invalid', errors: result.errors });
      return htmlResponse(400, renderLicensingPage({
        crawler,
        branding,
        inquiryPath: paths.inquiry,
        pathname: result.value.requestedPath || '/',
        errors: result.errors,
        values: result.value,
      }));
    }

    const inquiry = {
      ...result.value,
      siteId: config.siteId ?? null,
      userAgent: headerValue(request.headers, 'user-agent') ?? null,
      ip: presentIp(clientIp),
      receivedAt: new Date().toISOString(),
    };

    try {
      if (typeof licensing.onInquiry === 'function') {
        await licensing.onInquiry(inquiry);
      } else if (config.reporting && config.reporting.endpoint && config.reporting.siteKey) {
        await fetchJson(new URL('/v1/inquiries', config.reporting.endpoint).toString(), {
          method: 'POST',
          fetchImpl: config.fetchImpl,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${config.reporting.siteKey}`,
          },
          body: JSON.stringify(inquiry),
        });
      } else {
        onError(new Error('licensing inquiry received but no delivery is configured; set licensing.onInquiry or reporting.endpoint'));
      }
    } catch (error) {
      onError(error);
      if (wantsJson) return jsonResponse(502, { status: 'error', message: 'Could not record the inquiry. Please email the site owner.' });
      return htmlResponse(502, renderLicensingPage({
        crawler,
        branding,
        inquiryPath: paths.inquiry,
        pathname: result.value.requestedPath || '/',
        errors: ['We could not record that inquiry. Please try again, or email the site owner directly.'],
        values: result.value,
      }));
    }

    return wantsJson
      ? jsonResponse(202, { status: 'received' })
      : htmlResponse(202, renderInquiryReceived({ branding }));
  }

  /**
   * @param {object} request
   * @param {string} request.method
   * @param {string} request.url        path or absolute URL
   * @param {object|Headers} request.headers
   * @param {string} [request.socketIp] the peer address of the TCP connection
   * @param {string} [request.ip]       override; skips trustProxy resolution
   * @param {() => Promise<string|object>} [request.readBody] for the inquiry form
   * @returns {Promise<object>} decision
   */
  async function inspect(request) {
    const method = (request.method ?? 'GET').toUpperCase();
    const pathname = toPathname(request.url);
    const headers = request.headers ?? {};
    const userAgent = headerValue(headers, 'user-agent') ?? '';

    const { ip: clientIp, source: ipSource } = request.ip
      ? { ip: request.ip, source: 'explicit' }
      : resolveClientIp({ headers, socketIp: request.socketIp, trustProxy: config.trustProxy });

    const base = {
      matched: false,
      crawler: null,
      verification: null,
      action: 'ignore',
      reason: null,
      source: null,
      pathname,
      method,
      clientIp,
      ipSource,
      response: null,
      kind: 'pass',
      logged: false,
    };

    // Reserved paths are always reachable, including by a bot we are blocking:
    // a crawler that cannot read robots.txt or the licensing page has no way
    // to comply or to get in touch, which defeats the point of both.
    if (reserved.has(pathname)) {
      if (pathname === paths.robots && config.robots?.serve && (method === 'GET' || method === 'HEAD')) {
        return {
          ...base,
          kind: 'robots',
          response: textResponse(200, robotsBody(), { 'cache-control': 'public, max-age=300' }),
        };
      }
      if (pathname === paths.inquiry && method === 'POST') {
        return { ...base, kind: 'inquiry', response: await handleInquiry({ ...request, headers }, clientIp) };
      }
      if (pathname === paths.licensing && (method === 'GET' || method === 'HEAD')) {
        const accept = headerValue(headers, 'accept') ?? '';
        if (accept.includes('application/json') || !accept.includes('text/html')) {
          return {
            ...base,
            kind: 'descriptor',
            response: jsonResponse(200, licensingDescriptor({
              branding,
              inquiryUrl: licensing.publicUrl ? new URL(paths.inquiry, licensing.publicUrl).toString() : paths.inquiry,
              policySummary: policySummary(),
            })),
          };
        }
        return {
          ...base,
          kind: 'licensing',
          response: htmlResponse(200, renderLicensingPage({
            crawler: null,
            branding,
            inquiryPath: paths.inquiry,
            pathname,
          })),
        };
      }
    }

    const catalog = catalogStore.current;
    const match = detect(userAgent, catalog);
    if (!match) return base;

    const crawler = match.crawler;
    let verification;
    if (verificationMode === 'background') {
      const cached = verifier.peek(clientIp, crawler);
      if (cached) {
        verification = { ...cached, cached: true };
      } else {
        verification = { status: UNKNOWN, method: null, reason: 'verification_pending', hostname: null, cached: false };
        verifier.verify(clientIp, crawler).catch(onError);
      }
    } else {
      verification = await verifier.verify(clientIp, crawler);
    }

    const policy = getPolicy();
    const resolved = policy.resolve({ crawler, verification, pathname });

    const decision = {
      ...base,
      matched: true,
      crawler,
      verification,
      action: resolved.action,
      reason: resolved.reason,
      source: resolved.source,
      matchedPath: resolved.matchedPath,
      matchedPattern: match.pattern,
      kind: 'pass',
    };

    if (resolved.action === 'block') {
      decision.kind = 'block';
      decision.response = buildBlockResponse(decision);
    } else if (resolved.action === 'license') {
      decision.kind = 'licensing';
      decision.response = licensing.enabled
        ? htmlResponse(licensing.status ?? DEFAULTS.licensingStatus, renderLicensingPage({
          crawler,
          branding,
          inquiryPath: paths.inquiry,
          pathname,
          verification,
        }), { 'x-ai-crawler-guard': `license; bot=${crawler.id}` })
        : buildBlockResponse(decision);
    }

    // Every AI bot hit is logged, whatever the outcome - the point of the tool
    // is knowing what is out there, not only what was stopped.
    reporter.record({
      siteId: config.siteId ?? null,
      botId: crawler.id,
      botName: crawler.name,
      operator: crawler.operator,
      purpose: crawler.purpose,
      path: pathname,
      method,
      host: headerValue(headers, 'host') ?? null,
      referrer: headerValue(headers, 'referer') ?? null,
      userAgent: userAgent.slice(0, 512),
      ip: presentIp(clientIp),
      verification: verification.status,
      verificationMethod: verification.method,
      verificationReason: verification.reason,
      action: resolved.action,
      ruleSource: resolved.source,
      responseStatus: decision.response?.status ?? null,
    });
    decision.logged = true;

    config.onDecision?.(decision);
    return decision;
  }

  function buildBlockResponse(decision) {
    if (typeof config.blockResponse === 'function') {
      return config.blockResponse(decision);
    }
    const lines = [
      `${decision.crawler.name} is not permitted to crawl this site.`,
      '',
      decision.reason,
    ];
    if (licensing.enabled && licensing.publicUrl) {
      lines.push('', `Licensed access is available: ${new URL(paths.licensing, licensing.publicUrl).toString()}`);
    }
    return textResponse(config.blockStatus, `${lines.join('\n')}\n`, {
      'x-ai-crawler-guard': `block; bot=${decision.crawler.id}; identity=${decision.verification.status}`,
    });
  }

  return {
    inspect,
    /** The generated robots.txt, for serving or for the dashboard preview. */
    robotsTxt: robotsBody,
    policySummary,
    get catalog() {
      return catalogStore.current;
    },
    get policy() {
      return getPolicy();
    },
    /** Replace the local policy at runtime (used by tests and by hot reload). */
    setPolicy(raw) {
      localPolicy = buildPolicy(raw);
      return localPolicy;
    },
    reporter,
    verifier,
    paths,
    async refresh() {
      await catalogStore.refresh();
      if (policyRemote) await policyRemote.refresh();
    },
    async close() {
      catalogStore.close();
      policyRemote?.close();
      await reporter.close();
    },
  };
}

export { compileCatalog };
