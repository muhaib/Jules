/**
 * IP parsing, CIDR matching and client-address resolution.
 *
 * Getting the client address right is load-bearing here: every verification
 * decision is made about one specific IP, so if an attacker can choose which
 * address we inspect, reverse-DNS verification is decorative. Hence the
 * deliberately conservative `trustProxy` default of `false`.
 */

const V4_MAPPED_PREFIX = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff]);

/**
 * @param {string} input
 * @returns {{version: 4|6, bytes: Uint8Array} | null}
 */
export function parseIp(input) {
  if (typeof input !== 'string') return null;
  let str = input.trim();
  if (!str) return null;
  if (str.startsWith('[')) {
    const close = str.indexOf(']');
    if (close === -1) return null;
    str = str.slice(1, close);
  }
  const zone = str.indexOf('%');
  if (zone !== -1) str = str.slice(0, zone);

  if (str.includes(':')) return parseIpv6(str);
  return parseIpv4(str);
}

function parseIpv4(str) {
  const parts = str.split('.');
  if (parts.length !== 4) return null;
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) {
    const part = parts[i];
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    bytes[i] = value;
  }
  return { version: 4, bytes };
}

function parseIpv6(str) {
  const halves = str.split('::');
  if (halves.length > 2) return null;

  const expand = (chunk) => (chunk === '' ? [] : chunk.split(':'));
  let head = expand(halves[0]);
  let tail = halves.length === 2 ? expand(halves[1]) : [];

  // A trailing dotted-quad ("::ffff:192.0.2.1") occupies the last two groups.
  const groups = halves.length === 2 ? tail : head;
  if (groups.length && groups[groups.length - 1].includes('.')) {
    const v4 = parseIpv4(groups[groups.length - 1]);
    if (!v4) return null;
    const hi = ((v4.bytes[0] << 8) | v4.bytes[1]).toString(16);
    const lo = ((v4.bytes[2] << 8) | v4.bytes[3]).toString(16);
    groups.splice(groups.length - 1, 1, hi, lo);
  }

  const total = head.length + tail.length;
  if (halves.length === 1 ? total !== 8 : total > 7) return null;

  const words = [
    ...head,
    ...new Array(8 - total).fill('0'),
    ...tail,
  ];
  if (halves.length === 1 && words.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const word = words[i];
    if (!/^[0-9a-fA-F]{1,4}$/.test(word)) return null;
    const value = parseInt(word, 16);
    bytes[i * 2] = value >> 8;
    bytes[i * 2 + 1] = value & 0xff;
  }

  // Unwrap IPv4-mapped addresses so ::ffff:203.0.113.5 and 203.0.113.5 compare
  // equal and match the same IPv4 CIDRs.
  if (bytes.slice(0, 12).every((b, i) => b === V4_MAPPED_PREFIX[i])) {
    return { version: 4, bytes: bytes.slice(12) };
  }
  return { version: 6, bytes };
}

/** Canonical string form, used as a cache key and for logging. */
export function normalizeIp(input) {
  const parsed = parseIp(input);
  if (!parsed) return null;
  if (parsed.version === 4) return parsed.bytes.join('.');
  const words = [];
  for (let i = 0; i < 16; i += 2) {
    words.push(((parsed.bytes[i] << 8) | parsed.bytes[i + 1]).toString(16));
  }
  // RFC 5952: lowercase, longest run of zero groups collapsed once.
  let bestStart = -1;
  let bestLen = 0;
  let runStart = -1;
  for (let i = 0; i <= words.length; i++) {
    if (i < words.length && words[i] === '0') {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      const len = i - runStart;
      if (len > bestLen) {
        bestLen = len;
        bestStart = runStart;
      }
      runStart = -1;
    }
  }
  if (bestLen < 2) return words.join(':');
  return `${words.slice(0, bestStart).join(':')}::${words.slice(bestStart + bestLen).join(':')}`;
}

export function sameIp(a, b) {
  const pa = parseIp(a);
  const pb = parseIp(b);
  if (!pa || !pb || pa.version !== pb.version) return false;
  return pa.bytes.every((byte, i) => byte === pb.bytes[i]);
}

/** @returns {{version:4|6, bytes:Uint8Array, prefix:number} | null} */
export function parseCidr(cidr) {
  if (typeof cidr !== 'string') return null;
  const slash = cidr.lastIndexOf('/');
  const addrPart = slash === -1 ? cidr : cidr.slice(0, slash);
  const parsed = parseIp(addrPart);
  if (!parsed) return null;
  const maxBits = parsed.version === 4 ? 32 : 128;
  if (slash === -1) return { ...parsed, prefix: maxBits };
  const prefix = Number(cidr.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxBits) return null;
  return { ...parsed, prefix };
}

export function cidrContains(cidr, ip) {
  const net = typeof cidr === 'string' ? parseCidr(cidr) : cidr;
  const addr = parseIp(ip);
  if (!net || !addr || net.version !== addr.version) return false;
  const fullBytes = net.prefix >> 3;
  for (let i = 0; i < fullBytes; i++) {
    if (net.bytes[i] !== addr.bytes[i]) return false;
  }
  const remainingBits = net.prefix & 7;
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return (net.bytes[fullBytes] & mask) === (addr.bytes[fullBytes] & mask);
}

export function inAnyCidr(cidrs, ip) {
  if (!Array.isArray(cidrs)) return false;
  return cidrs.some((cidr) => cidrContains(cidr, ip));
}

function forwardedForList(headers) {
  const raw = headerValue(headers, 'x-forwarded-for');
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => normalizeIp(entry))
    .filter(Boolean);
}

export function headerValue(headers, name) {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  if (typeof headers.get === 'function') {
    const value = headers.get(lower);
    return value === null ? undefined : value;
  }
  const direct = headers[lower] ?? headers[name];
  if (Array.isArray(direct)) return direct.join(', ');
  return direct;
}

/**
 * Resolve the address we will actually verify.
 *
 * trustProxy:
 *   false        - ignore forwarding headers entirely (default, and correct
 *                  when the app is directly exposed).
 *   <number n>   - you run exactly n trusted proxies in front of the app; the
 *                  client is the nth entry counting back from the right.
 *   <string[]>   - CIDRs of your own proxies; entries are peeled off the right
 *                  while they are yours, and the first address that is not
 *                  yours is the client.
 *   true         - take the leftmost X-Forwarded-For entry. Only safe when an
 *                  edge you control rewrites the header on every request;
 *                  otherwise any caller can name its own IP.
 *
 * @returns {{ip: string|null, source: string}}
 */
export function resolveClientIp({ headers, socketIp, trustProxy = false }) {
  const socket = normalizeIp(socketIp);
  if (trustProxy === false || trustProxy === undefined || trustProxy === null) {
    return { ip: socket, source: 'socket' };
  }

  const chain = forwardedForList(headers);
  if (!chain.length) {
    const real = normalizeIp(headerValue(headers, 'x-real-ip'));
    if (real && trustProxy !== false) return { ip: real, source: 'x-real-ip' };
    return { ip: socket, source: 'socket' };
  }

  if (trustProxy === true) {
    return { ip: chain[0], source: 'x-forwarded-for[0]' };
  }

  if (typeof trustProxy === 'number' && Number.isInteger(trustProxy) && trustProxy > 0) {
    // The socket peer is proxy #1 and is not in the header, so n hops means
    // dropping (n - 1) header entries from the right.
    const index = chain.length - trustProxy;
    if (index < 0) return { ip: chain[0], source: 'x-forwarded-for[0]' };
    return { ip: chain[index], source: `x-forwarded-for[${index}]` };
  }

  if (Array.isArray(trustProxy)) {
    const full = socket ? [...chain, socket] : [...chain];
    for (let i = full.length - 1; i >= 0; i--) {
      if (!inAnyCidr(trustProxy, full[i])) {
        return { ip: full[i], source: i === full.length - 1 ? 'socket' : `x-forwarded-for[${i}]` };
      }
    }
    return { ip: full[0] ?? socket, source: 'x-forwarded-for[0]' };
  }

  return { ip: socket, source: 'socket' };
}
