/**
 * Identity verification for a request that claims to be a known crawler.
 *
 * The primary method is the one Google documents for Googlebot and every other
 * operator that publishes PTR records: reverse-DNS the connecting IP, check the
 * hostname belongs to the operator, then forward-resolve that hostname and
 * confirm it points back at the same IP. A spoofer controls their user-agent
 * string and their own DNS, but not the operator's reverse DNS zone.
 *
 * The second method is prefix matching against an operator-published IP list,
 * for operators (OpenAI, Anthropic, Perplexity, Meta) who publish ranges rather
 * than PTR records.
 *
 * Three-valued logic, deliberately:
 *   verified     - a method positively confirmed the claim
 *   spoofed      - a method positively refuted it (no PTR, wrong zone, forward
 *                  lookup points elsewhere, IP outside published ranges)
 *   unknown      - nothing could answer right now (DNS timeout, ranges not
 *                  loaded). NOT the same as refuted, and must not be treated
 *                  as one: a flaky resolver would otherwise start blocking
 *                  legitimate crawlers.
 *   unverifiable - the operator publishes no way to check at all
 */
import dns from 'node:dns';
import { inAnyCidr, normalizeIp, parseCidr, parseIp, sameIp } from './ip.js';

export const VERIFIED = 'verified';
export const SPOOFED = 'spoofed';
export const UNKNOWN = 'unknown';
export const UNVERIFIABLE = 'unverifiable';

const DEFAULT_TTL = {
  [VERIFIED]: 6 * 60 * 60 * 1000,
  [SPOOFED]: 30 * 60 * 1000,
  [UNKNOWN]: 60 * 1000,
  [UNVERIFIABLE]: 6 * 60 * 60 * 1000,
};

/** DNS failures that mean "this name does not exist", i.e. real evidence. */
const NEGATIVE_DNS_CODES = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

class TtlCache {
  #map = new Map();
  #max;
  #now;

  constructor({ max = 10_000, now = Date.now } = {}) {
    this.#max = max;
    this.#now = now;
  }

  get(key) {
    const entry = this.#map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.#map.delete(key);
      return undefined;
    }
    // Refresh recency so hot crawler IPs survive eviction.
    this.#map.delete(key);
    this.#map.set(key, entry);
    return entry.value;
  }

  set(key, value, ttlMs) {
    if (this.#map.has(key)) this.#map.delete(key);
    this.#map.set(key, { value, expiresAt: this.#now() + ttlMs });
    while (this.#map.size > this.#max) {
      this.#map.delete(this.#map.keys().next().value);
    }
  }

  get size() {
    return this.#map.size;
  }

  clear() {
    this.#map.clear();
  }
}

function withTimeout(promise, ms, label) {
  if (!ms || ms <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out after ${ms}ms`);
      error.code = 'ETIMEOUT';
      reject(error);
    }, ms);
    timer.unref?.();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function hostnameMatchesSuffix(hostname, suffixes) {
  const host = hostname.toLowerCase().replace(/\.+$/, '');
  return suffixes.some((suffix) => host.endsWith(suffix) || host === suffix.slice(1));
}

/**
 * Fetches and caches operator-published IP prefix lists.
 * Disabled unless `enabled` is true - a middleware should not make outbound
 * requests the operator never asked for.
 */
export class RangeStore {
  #cache = new Map();
  #inflight = new Map();

  constructor({ enabled = false, fetchImpl = globalThis.fetch, ttlMs = 12 * 60 * 60 * 1000, timeoutMs = 5000, onError = () => {}, now = Date.now } = {}) {
    this.enabled = enabled;
    this.fetchImpl = fetchImpl;
    this.ttlMs = ttlMs;
    this.timeoutMs = timeoutMs;
    this.onError = onError;
    this.now = now;
  }

  /** Cached prefixes for a URL, or null when nothing usable is loaded. */
  get(url) {
    const entry = this.#cache.get(url);
    if (!entry) return null;
    return entry.prefixes;
  }

  #stale(url) {
    const entry = this.#cache.get(url);
    return !entry || entry.fetchedAt + this.ttlMs <= this.now();
  }

  /** Kick off a refresh if needed. Never throws, never blocks the caller. */
  warm(url) {
    if (!this.enabled || !url || !this.#stale(url) || this.#inflight.has(url)) return;
    const task = this.#fetch(url)
      .catch((error) => {
        this.onError(error);
        return null;
      })
      .finally(() => this.#inflight.delete(url));
    this.#inflight.set(url, task);
  }

  async refresh(url) {
    if (!this.enabled || !url) return null;
    if (this.#inflight.has(url)) return this.#inflight.get(url);
    const task = this.#fetch(url).finally(() => this.#inflight.delete(url));
    this.#inflight.set(url, task);
    return task;
  }

  async #fetch(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`range list ${url} returned HTTP ${response.status}`);
      const prefixes = parsePrefixDocument(await response.json());
      if (!prefixes.length) throw new Error(`range list ${url} contained no usable prefixes`);
      this.#cache.set(url, { prefixes, fetchedAt: this.now() });
      return prefixes;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Accepts the shape Google/OpenAI/Anthropic publish
 * (`{prefixes: [{ipv4Prefix}|{ipv6Prefix}]}`) and a plain array of CIDR strings.
 */
export function parsePrefixDocument(doc) {
  const out = [];
  const push = (value) => {
    const parsed = parseCidr(value);
    if (parsed) out.push(parsed);
  };
  if (Array.isArray(doc)) {
    for (const entry of doc) {
      if (typeof entry === 'string') push(entry);
      else if (entry && typeof entry === 'object') {
        push(entry.ipv4Prefix ?? entry.ipv6Prefix ?? entry.prefix ?? entry.cidr);
      }
    }
    return out;
  }
  if (doc && Array.isArray(doc.prefixes)) return parsePrefixDocument(doc.prefixes);
  if (doc && Array.isArray(doc.creationTime)) return out;
  return out;
}

export function createVerifier({
  resolver,
  timeoutMs = 1500,
  cacheMax = 10_000,
  ttl = {},
  now = Date.now,
  rangeStore,
  onError = () => {},
} = {}) {
  const ttls = { ...DEFAULT_TTL, ...ttl };
  const cache = new TtlCache({ max: cacheMax, now });
  const inflight = new Map();
  const ranges = rangeStore ?? new RangeStore({ enabled: false });

  const dnsResolver = resolver ?? new dns.promises.Resolver({ timeout: timeoutMs, tries: 1 });

  async function dnsCheck(ip, crawler) {
    const parsed = parseIp(ip);
    if (!parsed) return { outcome: 'negative', reason: 'unparseable_ip' };

    let hostnames;
    try {
      hostnames = await withTimeout(dnsResolver.reverse(ip), timeoutMs, 'reverse DNS');
    } catch (error) {
      if (NEGATIVE_DNS_CODES.has(error.code)) {
        return { outcome: 'negative', reason: 'no_ptr_record' };
      }
      onError(error);
      return { outcome: 'inconclusive', reason: `reverse_dns_failed:${error.code ?? 'ERR'}` };
    }
    if (!hostnames?.length) return { outcome: 'negative', reason: 'no_ptr_record' };

    const candidates = hostnames.filter((h) => hostnameMatchesSuffix(h, crawler.verification.hostnameSuffixes));
    if (!candidates.length) {
      return {
        outcome: 'negative',
        reason: 'ptr_hostname_not_operator_owned',
        hostname: hostnames[0],
      };
    }

    // Forward-confirm: the PTR hostname must resolve back to this exact IP.
    // Without this step anyone who controls a reverse zone could point it at
    // a name they do not own.
    let sawError = false;
    for (const hostname of candidates) {
      let addresses;
      try {
        addresses = await withTimeout(
          parsed.version === 4 ? dnsResolver.resolve4(hostname) : dnsResolver.resolve6(hostname),
          timeoutMs,
          'forward DNS',
        );
      } catch (error) {
        if (!NEGATIVE_DNS_CODES.has(error.code)) {
          sawError = true;
          onError(error);
        }
        continue;
      }
      if (addresses?.some((address) => sameIp(address, ip))) {
        return { outcome: 'positive', reason: 'reverse_and_forward_confirmed', hostname };
      }
    }
    if (sawError) {
      return { outcome: 'inconclusive', reason: 'forward_lookup_failed', hostname: candidates[0] };
    }
    return { outcome: 'negative', reason: 'forward_confirm_mismatch', hostname: candidates[0] };
  }

  function cidrCheck(ip, crawler) {
    const { ranges: staticRanges, rangesUrl } = crawler.verification;
    const fetched = rangesUrl ? ranges.get(rangesUrl) : null;
    if (rangesUrl) ranges.warm(rangesUrl);
    const all = [...staticRanges, ...(fetched ?? [])];
    if (!all.length) {
      return {
        outcome: 'inconclusive',
        reason: rangesUrl ? 'published_ranges_not_loaded' : 'no_ranges_configured',
      };
    }
    if (inAnyCidr(all, ip)) {
      return { outcome: 'positive', reason: 'ip_in_published_ranges' };
    }
    return { outcome: 'negative', reason: 'ip_outside_published_ranges' };
  }

  async function run(ip, crawler) {
    const methods = crawler.verification.methods;
    if (!methods.length) {
      return { status: UNVERIFIABLE, method: null, reason: 'operator_publishes_no_verification_method' };
    }
    let negative = null;
    let inconclusive = null;
    for (const method of methods) {
      const result = method === 'dns' ? await dnsCheck(ip, crawler) : cidrCheck(ip, crawler);
      if (result.outcome === 'positive') {
        return { status: VERIFIED, method, reason: result.reason, hostname: result.hostname ?? null };
      }
      if (result.outcome === 'negative' && !negative) {
        negative = { status: SPOOFED, method, reason: result.reason, hostname: result.hostname ?? null };
      }
      if (result.outcome === 'inconclusive' && !inconclusive) {
        inconclusive = { status: UNKNOWN, method, reason: result.reason, hostname: result.hostname ?? null };
      }
    }
    return negative ?? inconclusive ?? { status: UNKNOWN, method: null, reason: 'no_method_produced_a_result' };
  }

  return {
    /**
     * @returns {Promise<{status: string, method: string|null, reason: string, hostname: string|null, cached: boolean, ip: string}>}
     */
    async verify(rawIp, crawler) {
      const ip = normalizeIp(rawIp);
      if (!ip) {
        return { status: UNKNOWN, method: null, reason: 'no_client_ip', hostname: null, cached: false, ip: null };
      }
      const key = `${crawler.id}|${ip}`;
      const hit = cache.get(key);
      if (hit) return { ...hit, cached: true };

      // Coalesce: a crawler hitting 50 URLs at once should cause one lookup.
      let pending = inflight.get(key);
      if (!pending) {
        pending = run(ip, crawler)
          .then((result) => {
            const value = { ...result, hostname: result.hostname ?? null, ip };
            cache.set(key, value, ttls[value.status] ?? ttls[UNKNOWN]);
            return value;
          })
          .catch((error) => {
            onError(error);
            return { status: UNKNOWN, method: null, reason: 'verifier_error', hostname: null, ip };
          })
          .finally(() => inflight.delete(key));
        inflight.set(key, pending);
      }
      const result = await pending;
      return { ...result, cached: false };
    },

    /** Peek at the cache without triggering a lookup. */
    peek(rawIp, crawler) {
      const ip = normalizeIp(rawIp);
      if (!ip) return undefined;
      return cache.get(`${crawler.id}|${ip}`);
    },

    get cacheSize() {
      return cache.size;
    },
    clearCache: () => cache.clear(),
    rangeStore: ranges,
  };
}
