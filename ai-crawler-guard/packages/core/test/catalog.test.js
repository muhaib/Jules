import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CatalogStore, compileCatalog, defaultCatalogSource } from '../src/catalog.js';

test('the shipped catalog compiles', () => {
  const catalog = compileCatalog(defaultCatalogSource());
  assert.ok(catalog.crawlers.length > 20);
  assert.ok(catalog.byId.has('gptbot'));
  assert.ok(catalog.byId.has('claudebot'));
  assert.ok(catalog.byId.has('ccbot'));
});

test('robots-only tokens are excluded from user-agent matching', () => {
  const catalog = compileCatalog(defaultCatalogSource());
  const extended = catalog.byId.get('google-extended');
  assert.equal(extended.robotsOnly, true);
  assert.equal(catalog.matchable.some((c) => c.id === 'google-extended'), false);
});

test('duplicate ids are rejected', () => {
  assert.throws(() => compileCatalog({
    crawlers: [
      { id: 'a', robotsToken: 'A', userAgentPatterns: ['A'] },
      { id: 'a', robotsToken: 'B', userAgentPatterns: ['B'] },
    ],
  }), /duplicate crawler id/);
});

test('robots tokens that collide case-insensitively are rejected', () => {
  assert.throws(() => compileCatalog({
    crawlers: [
      { id: 'a', robotsToken: 'Bot', userAgentPatterns: ['A'] },
      { id: 'b', robotsToken: 'bot', userAgentPatterns: ['B'] },
    ],
  }), /duplicate robotsToken/);
});

test('a dns method without hostname suffixes is a config error', () => {
  assert.throws(() => compileCatalog({
    crawlers: [{ id: 'a', robotsToken: 'A', userAgentPatterns: ['A'], verification: { methods: ['dns'] } }],
  }), /requires at least one hostnameSuffix/);
});

test('an unmatched crawler that is not robotsOnly is a config error', () => {
  assert.throws(() => compileCatalog({
    crawlers: [{ id: 'a', robotsToken: 'A', userAgentPatterns: [] }],
  }), /can never match traffic/);
});

test('robots tokens containing whitespace are rejected', () => {
  assert.throws(() => compileCatalog({
    crawlers: [{ id: 'a', robotsToken: 'Two Words', userAgentPatterns: ['A'] }],
  }), /cannot appear in a robots.txt user-agent line/);
});

test('invalid CIDRs and regexes are caught at load time, not at request time', () => {
  assert.throws(() => compileCatalog({
    crawlers: [{ id: 'a', robotsToken: 'A', userAgentPatterns: ['A'], verification: { methods: ['cidr'], ranges: ['nope'] } }],
  }), /invalid CIDR/);
  assert.throws(() => compileCatalog({
    crawlers: [{ id: 'a', robotsToken: 'A', userAgentPatterns: ['re:[unclosed'] }],
  }), /invalid regular expression/);
});

test('hostname suffixes are normalised to a leading dot', () => {
  const catalog = compileCatalog({
    crawlers: [{
      id: 'a', robotsToken: 'A', userAgentPatterns: ['A'],
      verification: { methods: ['dns'], hostnameSuffixes: ['Crawl.Example.COM.'] },
    }],
  });
  assert.deepEqual(catalog.byId.get('a').verification.hostnameSuffixes, ['.crawl.example.com']);
});

test('a catalog loads from a file on disk', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aicg-'));
  const file = join(dir, 'crawlers.json');
  await writeFile(file, JSON.stringify({
    version: 'ondisk',
    crawlers: [{ id: 'filebot', robotsToken: 'FileBot', userAgentPatterns: ['FileBot'] }],
  }));
  const store = new CatalogStore({ source: file });
  const catalog = await store.load();
  assert.equal(catalog.version, 'ondisk');
  store.close();
});

test('a failed refresh keeps the previous catalog instead of falling open', async () => {
  let call = 0;
  const errors = [];
  const store = new CatalogStore({
    source: 'https://example.com/crawlers.json',
    onError: (error) => errors.push(error),
    fetchImpl: async () => {
      call++;
      if (call === 1) {
        return { ok: true, json: async () => ({ version: 'v1', crawlers: [{ id: 'a', robotsToken: 'A', userAgentPatterns: ['A'] }] }) };
      }
      return { ok: false, status: 500 };
    },
  });
  await store.load();
  assert.equal(store.current.version, 'v1');
  await store.refresh();
  assert.equal(store.current.version, 'v1', 'still serving the last good catalog');
  assert.equal(errors.length, 1);
  store.close();
});

test('a remote catalog can be fetched with an authorization header', async () => {
  const seen = [];
  const store = new CatalogStore({
    source: 'https://api.example.com/v1/crawlers',
    headers: { authorization: 'Bearer aicg_live_x' },
    fetchImpl: async (url, init) => {
      seen.push(init.headers);
      return { ok: true, json: async () => ({ version: 'remote', crawlers: [{ id: 'a', robotsToken: 'A', userAgentPatterns: ['A'] }] }) };
    },
  });
  await store.load();
  assert.equal(store.current.version, 'remote');
  assert.equal(seen[0].authorization, 'Bearer aicg_live_x');
  store.close();
});

test('an unreachable remote catalog falls back to the bundled list at boot', async () => {
  const errors = [];
  const store = new CatalogStore({
    source: 'https://api.example.com/v1/crawlers',
    fallbackToDefault: true,
    onError: (error) => errors.push(error),
    fetchImpl: async () => { throw new Error('connect ECONNREFUSED'); },
  });
  await store.load();
  assert.equal(store.usingFallback, true);
  assert.ok(store.current.byId.has('gptbot'), 'the bundled signatures are in use');
  assert.equal(errors.length, 1);
  store.close();
});

test('without the fallback an unreachable catalog is a hard failure', async () => {
  const store = new CatalogStore({
    source: 'https://api.example.com/v1/crawlers',
    fetchImpl: async () => { throw new Error('connect ECONNREFUSED'); },
  });
  await assert.rejects(() => store.load(), /ECONNREFUSED/);
});
