import test from 'node:test';
import assert from 'node:assert/strict';
import { createVerifier, RangeStore, parsePrefixDocument } from '../src/verify.js';
import { fakeResolver, testCatalog } from './helpers.js';

const catalog = testCatalog();
const dnsbot = catalog.byId.get('dnsbot');
const cidrbot = catalog.byId.get('cidrbot');
const openbot = catalog.byId.get('openbot');

test('reverse DNS plus forward confirmation verifies a real crawler', async () => {
  const resolver = fakeResolver({
    ptr: { '203.0.113.7': ['crawler-7.crawl.example.com'] },
    a: { 'crawler-7.crawl.example.com': ['203.0.113.7'] },
  });
  const verifier = createVerifier({ resolver });
  const result = await verifier.verify('203.0.113.7', dnsbot);
  assert.equal(result.status, 'verified');
  assert.equal(result.method, 'dns');
  assert.equal(result.hostname, 'crawler-7.crawl.example.com');
});

test('a missing PTR record is evidence of spoofing, not an error', async () => {
  const verifier = createVerifier({ resolver: fakeResolver({}) });
  const result = await verifier.verify('203.0.113.7', dnsbot);
  assert.equal(result.status, 'spoofed');
  assert.equal(result.reason, 'no_ptr_record');
});

test('a PTR record in someone else\'s zone is spoofing', async () => {
  const resolver = fakeResolver({
    ptr: { '203.0.113.7': ['host.attacker.example.net'] },
    a: { 'host.attacker.example.net': ['203.0.113.7'] },
  });
  const result = await createVerifier({ resolver }).verify('203.0.113.7', dnsbot);
  assert.equal(result.status, 'spoofed');
  assert.equal(result.reason, 'ptr_hostname_not_operator_owned');
});

test('suffix matching is anchored at a label boundary', async () => {
  // "notcrawl.example.com" must not satisfy a ".crawl.example.com" suffix.
  const resolver = fakeResolver({
    ptr: { '203.0.113.7': ['evil.notcrawl.example.com'] },
    a: { 'evil.notcrawl.example.com': ['203.0.113.7'] },
  });
  const result = await createVerifier({ resolver }).verify('203.0.113.7', dnsbot);
  assert.equal(result.status, 'spoofed');
});

test('forward confirmation catches a hijacked reverse zone', async () => {
  // The attacker controls reverse DNS for their own IP and points it at the
  // operator's domain; the forward lookup does not come back to them.
  const resolver = fakeResolver({
    ptr: { '66.66.66.66': ['crawler-7.crawl.example.com'] },
    a: { 'crawler-7.crawl.example.com': ['203.0.113.7'] },
  });
  const result = await createVerifier({ resolver }).verify('66.66.66.66', dnsbot);
  assert.equal(result.status, 'spoofed');
  assert.equal(result.reason, 'forward_confirm_mismatch');
});

test('a resolver timeout is unknown, never spoofed', async () => {
  const resolver = fakeResolver({ fail: { reverse: 'ETIMEOUT' } });
  const result = await createVerifier({ resolver }).verify('203.0.113.7', dnsbot);
  assert.equal(result.status, 'unknown');
  assert.match(result.reason, /^reverse_dns_failed/);
});

test('a forward-lookup server failure is unknown, not a mismatch', async () => {
  const resolver = fakeResolver({
    ptr: { '203.0.113.7': ['crawler-7.crawl.example.com'] },
    fail: { resolve4: 'SERVFAIL' },
  });
  const result = await createVerifier({ resolver }).verify('203.0.113.7', dnsbot);
  assert.equal(result.status, 'unknown');
  assert.equal(result.reason, 'forward_lookup_failed');
});

test('IPv6 clients are forward-confirmed against AAAA records', async () => {
  const resolver = fakeResolver({
    ptr: { '2001:db8::7': ['v6.crawl.example.com'] },
    aaaa: { 'v6.crawl.example.com': ['2001:0db8:0000::0007'] },
  });
  const result = await createVerifier({ resolver }).verify('2001:db8::7', dnsbot);
  assert.equal(result.status, 'verified');
  assert.equal(resolverCalls(resolver).resolve4, 0);
});

function resolverCalls(resolver) {
  return resolver.calls;
}

test('CIDR verification accepts published prefixes and rejects everything else', async () => {
  const verifier = createVerifier({ resolver: fakeResolver({}) });
  assert.equal((await verifier.verify('198.51.100.20', cidrbot)).status, 'verified');
  assert.equal((await verifier.verify('2001:db8:1:2::9', cidrbot)).status, 'verified');
  const bad = await verifier.verify('66.66.66.66', cidrbot);
  assert.equal(bad.status, 'spoofed');
  assert.equal(bad.reason, 'ip_outside_published_ranges');
});

test('a crawler with no published verification method is unverifiable', async () => {
  const result = await createVerifier({ resolver: fakeResolver({}) }).verify('1.2.3.4', openbot);
  assert.equal(result.status, 'unverifiable');
});

test('results are cached per crawler and IP', async () => {
  const resolver = fakeResolver({
    ptr: { '203.0.113.7': ['crawler-7.crawl.example.com'] },
    a: { 'crawler-7.crawl.example.com': ['203.0.113.7'] },
  });
  const verifier = createVerifier({ resolver });
  await verifier.verify('203.0.113.7', dnsbot);
  const second = await verifier.verify('203.0.113.7', dnsbot);
  assert.equal(second.cached, true);
  assert.equal(resolver.calls.reverse, 1);
});

test('cache entries expire on their status-specific TTL', async () => {
  let clock = 1_000_000;
  const resolver = fakeResolver({
    ptr: { '203.0.113.7': ['crawler-7.crawl.example.com'] },
    a: { 'crawler-7.crawl.example.com': ['203.0.113.7'] },
  });
  const verifier = createVerifier({ resolver, now: () => clock, ttl: { verified: 1000 } });
  await verifier.verify('203.0.113.7', dnsbot);
  clock += 1500;
  await verifier.verify('203.0.113.7', dnsbot);
  assert.equal(resolver.calls.reverse, 2);
});

test('concurrent hits from one IP collapse into a single lookup', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const resolver = {
    calls: { reverse: 0 },
    async reverse(ip) {
      resolver.calls.reverse++;
      await gate;
      return ['crawler-7.crawl.example.com'];
    },
    async resolve4() { return ['203.0.113.7']; },
    async resolve6() { return []; },
  };
  const verifier = createVerifier({ resolver });
  const all = Promise.all(Array.from({ length: 20 }, () => verifier.verify('203.0.113.7', dnsbot)));
  release();
  const results = await all;
  assert.equal(resolver.calls.reverse, 1);
  assert.ok(results.every((r) => r.status === 'verified'));
});

test('the cache is bounded', async () => {
  const verifier = createVerifier({ resolver: fakeResolver({}), cacheMax: 10 });
  for (let i = 0; i < 100; i++) {
    await verifier.verify(`198.51.100.${i % 256}`, cidrbot);
  }
  assert.ok(verifier.cacheSize <= 10);
});

test('prefix documents parse in the shapes operators actually publish', () => {
  assert.equal(parsePrefixDocument({ prefixes: [{ ipv4Prefix: '1.2.3.0/24' }, { ipv6Prefix: '2001:db8::/32' }] }).length, 2);
  assert.equal(parsePrefixDocument(['1.2.3.0/24', 'garbage']).length, 1);
  assert.equal(parsePrefixDocument({}).length, 0);
});

test('range fetching is off unless explicitly enabled', async () => {
  let called = 0;
  const store = new RangeStore({ enabled: false, fetchImpl: async () => { called++; } });
  store.warm('https://example.com/ranges.json');
  await new Promise((r) => setImmediate(r));
  assert.equal(called, 0);
  assert.equal(store.get('https://example.com/ranges.json'), null);
});

test('fetched ranges are used once loaded', async () => {
  const url = 'https://example.com/ranges.json';
  const store = new RangeStore({
    enabled: true,
    fetchImpl: async () => ({ ok: true, json: async () => ({ prefixes: [{ ipv4Prefix: '66.66.66.0/24' }] }) }),
  });
  await store.refresh(url);
  const remoteCatalog = testCatalog({
    crawlers: [{
      id: 'remotebot',
      name: 'RemoteBot',
      robotsToken: 'RemoteBot',
      userAgentPatterns: ['RemoteBot'],
      verification: { methods: ['cidr'], rangesUrl: url },
    }],
  });
  const verifier = createVerifier({ resolver: fakeResolver({}), rangeStore: store });
  const crawler = remoteCatalog.byId.get('remotebot');
  assert.equal((await verifier.verify('66.66.66.7', crawler)).status, 'verified');
  assert.equal((await verifier.verify('1.1.1.1', crawler)).status, 'spoofed');
});

test('a crawler whose ranges never loaded is unknown, not spoofed', async () => {
  const remoteCatalog = testCatalog({
    crawlers: [{
      id: 'remotebot',
      name: 'RemoteBot',
      robotsToken: 'RemoteBot',
      userAgentPatterns: ['RemoteBot'],
      verification: { methods: ['cidr'], rangesUrl: 'https://example.com/never.json' },
    }],
  });
  const verifier = createVerifier({ resolver: fakeResolver({}) });
  const result = await verifier.verify('66.66.66.7', remoteCatalog.byId.get('remotebot'));
  assert.equal(result.status, 'unknown');
  assert.equal(result.reason, 'published_ranges_not_loaded');
});

test('ordered methods: a positive from any method wins over an earlier negative', async () => {
  const mixed = testCatalog({
    crawlers: [{
      id: 'mixedbot',
      name: 'MixedBot',
      robotsToken: 'MixedBot',
      userAgentPatterns: ['MixedBot'],
      verification: {
        methods: ['dns', 'cidr'],
        hostnameSuffixes: ['.crawl.example.com'],
        ranges: ['198.51.100.0/24'],
      },
    }],
  });
  const verifier = createVerifier({ resolver: fakeResolver({}) }); // no PTR -> dns says no
  const result = await verifier.verify('198.51.100.5', mixed.byId.get('mixedbot'));
  assert.equal(result.status, 'verified');
  assert.equal(result.method, 'cidr');
});
