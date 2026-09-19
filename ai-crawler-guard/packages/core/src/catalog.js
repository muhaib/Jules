/**
 * Loading, validating and refreshing the crawler signature catalog.
 *
 * The catalog is data the operator owns: a bundled default, a file on disk, a
 * URL, or an object passed straight in. Bot names and behaviour change often
 * enough that baking the list into the engine would be a design bug.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { CatalogError } from './errors.js';
import { parseCidr } from './ip.js';

const require = createRequire(import.meta.url);

export const VERIFICATION_METHODS = new Set(['dns', 'cidr']);
export const PURPOSES = new Set(['training', 'search', 'user-fetch', 'other']);
export const ACTIONS = new Set(['allow', 'block', 'license', 'log']);

/** The signature list shipped with this package. */
export function defaultCatalogSource() {
  return require('../crawlers.json');
}

function compilePattern(pattern, crawlerId) {
  if (typeof pattern !== 'string' || !pattern.length) {
    throw new CatalogError('userAgentPatterns entries must be non-empty strings', {
      path: `crawlers[${crawlerId}].userAgentPatterns`,
    });
  }
  if (pattern.startsWith('re:')) {
    const body = pattern.slice(3);
    let regex;
    try {
      regex = new RegExp(body, 'i');
    } catch (cause) {
      throw new CatalogError(`invalid regular expression ${JSON.stringify(body)}`, {
        path: `crawlers[${crawlerId}].userAgentPatterns`,
        cause,
      });
    }
    return {
      raw: pattern,
      kind: 'regex',
      // Regex matches have no natural length, so score them by source length;
      // this only breaks ties between two matching signatures.
      weight: body.length,
      test: (ua) => regex.test(ua),
    };
  }
  const needle = pattern.toLowerCase();
  return {
    raw: pattern,
    kind: 'substring',
    weight: needle.length,
    test: (uaLower) => uaLower.includes(needle),
  };
}

function compileVerification(verification, crawlerId) {
  const spec = verification ?? {};
  const methods = spec.methods ?? [];
  if (!Array.isArray(methods)) {
    throw new CatalogError('verification.methods must be an array', {
      path: `crawlers[${crawlerId}].verification`,
    });
  }
  for (const method of methods) {
    if (!VERIFICATION_METHODS.has(method)) {
      throw new CatalogError(
        `unknown verification method ${JSON.stringify(method)}; expected one of ${[...VERIFICATION_METHODS].join(', ')}`,
        { path: `crawlers[${crawlerId}].verification.methods` },
      );
    }
  }

  const suffixes = (spec.hostnameSuffixes ?? []).map((suffix) => {
    if (typeof suffix !== 'string' || !suffix.length) {
      throw new CatalogError('hostnameSuffixes entries must be non-empty strings', {
        path: `crawlers[${crawlerId}].verification.hostnameSuffixes`,
      });
    }
    // Store with a leading dot so ".openai.com" can never match
    // "notopenai.com" - suffix matching without a label boundary is the
    // classic way these checks get bypassed.
    const lower = suffix.toLowerCase().replace(/\.+$/, '');
    return lower.startsWith('.') ? lower : `.${lower}`;
  });

  if (methods.includes('dns') && !suffixes.length) {
    throw new CatalogError('verification method "dns" requires at least one hostnameSuffix', {
      path: `crawlers[${crawlerId}].verification`,
    });
  }

  const ranges = (spec.ranges ?? []).map((range) => {
    const parsed = parseCidr(range);
    if (!parsed) {
      throw new CatalogError(`invalid CIDR ${JSON.stringify(range)}`, {
        path: `crawlers[${crawlerId}].verification.ranges`,
      });
    }
    return parsed;
  });

  return {
    methods,
    hostnameSuffixes: suffixes,
    ranges,
    rangesUrl: spec.rangesUrl ?? null,
  };
}

function compileCrawler(entry, index) {
  if (!entry || typeof entry !== 'object') {
    throw new CatalogError('crawler entries must be objects', { path: `crawlers[${index}]` });
  }
  const id = entry.id;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(id)) {
    throw new CatalogError(
      `crawler id must be a lowercase slug, got ${JSON.stringify(id)}`,
      { path: `crawlers[${index}].id` },
    );
  }
  const robotsToken = entry.robotsToken;
  if (typeof robotsToken !== 'string' || !robotsToken.length) {
    throw new CatalogError('robotsToken is required', { path: `crawlers[${id}]` });
  }
  if (/[\s#]/.test(robotsToken)) {
    throw new CatalogError(
      `robotsToken ${JSON.stringify(robotsToken)} contains whitespace or "#", which cannot appear in a robots.txt user-agent line`,
      { path: `crawlers[${id}].robotsToken` },
    );
  }
  if (entry.purpose !== undefined && !PURPOSES.has(entry.purpose)) {
    throw new CatalogError(
      `unknown purpose ${JSON.stringify(entry.purpose)}; expected one of ${[...PURPOSES].join(', ')}`,
      { path: `crawlers[${id}].purpose` },
    );
  }
  if (entry.defaultAction !== undefined && !ACTIONS.has(entry.defaultAction)) {
    throw new CatalogError(
      `unknown defaultAction ${JSON.stringify(entry.defaultAction)}`,
      { path: `crawlers[${id}].defaultAction` },
    );
  }

  const robotsOnly = entry.robotsOnly === true;
  const patterns = (entry.userAgentPatterns ?? []).map((p) => compilePattern(p, id));
  if (!robotsOnly && !patterns.length) {
    throw new CatalogError(
      'crawler has no userAgentPatterns and is not marked robotsOnly, so it can never match traffic',
      { path: `crawlers[${id}]` },
    );
  }
  if (robotsOnly && patterns.length) {
    throw new CatalogError(
      'robotsOnly crawlers must not declare userAgentPatterns - the token never appears in a User-Agent header',
      { path: `crawlers[${id}]` },
    );
  }

  return Object.freeze({
    id,
    name: entry.name ?? robotsToken,
    operator: entry.operator ?? 'Unknown',
    purpose: entry.purpose ?? 'other',
    robotsToken,
    robotsOnly,
    deprecated: entry.deprecated === true,
    defaultAction: entry.defaultAction ?? null,
    docs: entry.docs ?? null,
    note: entry.note ?? null,
    patterns,
    verification: compileVerification(entry.verification, id),
  });
}

/** @returns {{version: string, crawlers: object[], byId: Map<string, object>, matchable: object[]}} */
export function compileCatalog(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.crawlers)) {
    throw new CatalogError('catalog must be an object with a `crawlers` array');
  }
  const crawlers = raw.crawlers.map(compileCrawler);
  const byId = new Map();
  const byToken = new Map();
  for (const crawler of crawlers) {
    if (byId.has(crawler.id)) {
      throw new CatalogError(`duplicate crawler id ${JSON.stringify(crawler.id)}`);
    }
    byId.set(crawler.id, crawler);
    const tokenKey = crawler.robotsToken.toLowerCase();
    if (byToken.has(tokenKey)) {
      throw new CatalogError(
        `duplicate robotsToken ${JSON.stringify(crawler.robotsToken)} on "${crawler.id}" and "${byToken.get(tokenKey)}"; robots.txt tokens are matched case-insensitively so the second group would be unreachable`,
      );
    }
    byToken.set(tokenKey, crawler.id);
  }

  // Longest pattern first, so "Claude-SearchBot" is preferred over "ClaudeBot"
  // and "Ai2Bot-Dolma" over "AI2Bot" when both would match.
  const matchable = crawlers
    .filter((c) => !c.robotsOnly)
    .sort((a, b) => maxWeight(b) - maxWeight(a));

  return Object.freeze({
    version: typeof raw.version === 'string' ? raw.version : 'unversioned',
    crawlers: Object.freeze(crawlers),
    byId,
    matchable: Object.freeze(matchable),
    loadedAt: new Date().toISOString(),
  });
}

function maxWeight(crawler) {
  return crawler.patterns.reduce((max, p) => Math.max(max, p.weight), 0);
}

async function readSource(source, { fetchImpl = globalThis.fetch, timeoutMs = 5000, headers = {} } = {}) {
  if (!source || source === 'default') return defaultCatalogSource();
  if (typeof source === 'object') return source;
  if (typeof source !== 'string') {
    throw new CatalogError('catalog source must be an object, a file path, a URL, or "default"');
  }
  if (/^https?:\/\//i.test(source)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(source, {
        signal: controller.signal,
        headers: { accept: 'application/json', ...headers },
      });
      if (!response.ok) {
        throw new CatalogError(`catalog fetch returned HTTP ${response.status}`, { path: source });
      }
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }
  const text = await readFile(source, 'utf8');
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw new CatalogError('catalog file is not valid JSON', { path: source, cause });
  }
}

/**
 * Holds the active catalog and, when a refresh interval is set, swaps in a new
 * one in the background. A failed refresh keeps the previous catalog: a
 * temporarily unreachable config URL must never take the site's bot policy
 * offline.
 */
export class CatalogStore {
  #source;
  #options;
  #catalog;
  #timer = null;
  #onError;

  #fallbackToDefault;

  constructor({
    source = 'default', refreshMs = 0, fetchImpl, timeoutMs, headers, onError,
    fallbackToDefault = false,
  } = {}) {
    this.#source = source;
    this.#options = { fetchImpl, timeoutMs, headers };
    this.#onError = onError ?? (() => {});
    this.#catalog = null;
    this.#fallbackToDefault = fallbackToDefault;
    this.refreshMs = refreshMs;
  }

  get current() {
    if (!this.#catalog) throw new CatalogError('catalog not loaded yet; call load() first');
    return this.#catalog;
  }

  get loaded() {
    return this.#catalog !== null;
  }

  async load() {
    try {
      this.#catalog = compileCatalog(await readSource(this.#source, this.#options));
    } catch (error) {
      // A remote catalog that cannot be reached at boot must not stop the
      // site from starting. Fall back to the signature list shipped with the
      // package and keep retrying in the background.
      if (!this.#fallbackToDefault) throw error;
      this.#onError(error);
      this.#catalog = compileCatalog(defaultCatalogSource());
      this.usingFallback = true;
    }
    if (this.refreshMs > 0 && !this.#timer) {
      this.#timer = setInterval(() => {
        this.refresh().catch(() => {});
      }, this.refreshMs);
      this.#timer.unref?.();
    }
    return this.#catalog;
  }

  async refresh() {
    try {
      const next = compileCatalog(await readSource(this.#source, this.#options));
      this.#catalog = next;
      this.usingFallback = false;
      return next;
    } catch (error) {
      this.#onError(error);
      if (!this.#catalog) throw error;
      return this.#catalog;
    }
  }

  close() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}
