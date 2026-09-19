import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createAiCrawlerGuard } from '../src/index.js';
import { guardOptions, listen } from './fixtures.js';

test('the node:http handler reports whether it answered the request', async () => {
  const guard = await createAiCrawlerGuard(guardOptions());
  const handle = guard.node();
  const server = createServer(async (req, res) => {
    if (await handle(req, res)) return;
    res.statusCode = 200;
    res.end('origin content');
  });
  const { url, close } = await listen(server);

  const blocked = await fetch(url('/'), { headers: { 'user-agent': 'DnsBot/1.0' } });
  assert.equal(blocked.status, 403);

  const passed = await fetch(url('/'), { headers: { 'user-agent': 'Mozilla/5.0' } });
  assert.equal(await passed.text(), 'origin content');

  const robots = await fetch(url('/robots.txt'));
  assert.match(await robots.text(), /BEGIN ai-crawler-guard/);

  await close();
  await guard.close();
});

test('a HEAD request gets headers and no body', async () => {
  const guard = await createAiCrawlerGuard(guardOptions());
  const handle = guard.node();
  const server = createServer(async (req, res) => {
    if (await handle(req, res)) return;
    res.end('origin');
  });
  const { url, close } = await listen(server);
  const response = await fetch(url('/'), { method: 'HEAD', headers: { 'user-agent': 'DnsBot/1.0' } });
  assert.equal(response.status, 403);
  assert.equal(await response.text(), '');
  await close();
  await guard.close();
});

test('the Next.js adapter returns a Response for a blocked crawler and null otherwise', async () => {
  const guard = await createAiCrawlerGuard(guardOptions());
  const middleware = guard.next();

  const blocked = await middleware(new Request('https://example.com/page', {
    headers: { 'user-agent': 'DnsBot/1.0', 'x-forwarded-for': '203.0.113.7' },
  }));
  assert.ok(blocked instanceof Response);
  assert.equal(blocked.status, 403);
  assert.match(await blocked.text(), /DnsBot is not permitted/);

  const passed = await middleware(new Request('https://example.com/page', {
    headers: { 'user-agent': 'Mozilla/5.0' },
  }));
  assert.equal(passed, null);
  await guard.close();
});

test('the Next.js adapter serves robots.txt and the licensing form', async () => {
  const received = [];
  const guard = await createAiCrawlerGuard(guardOptions({
    licensing: { onInquiry: async (i) => received.push(i) },
  }));
  const middleware = guard.next();

  const robots = await middleware(new Request('https://example.com/robots.txt'));
  assert.equal(robots.status, 200);
  assert.match(await robots.text(), /User-agent: DnsBot/);

  const inquiry = await middleware(new Request('https://example.com/.well-known/ai-licensing/inquiry', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Ann', email: 'ann@lab.ai' }),
  }));
  assert.equal(inquiry.status, 202);
  assert.equal(received.length, 1);
  await guard.close();
});

test('an edge runtime without node:dns degrades to unknown, never to a false verified', async () => {
  const noDns = {
    async reverse() { const e = new Error('not implemented'); e.code = 'ENOTIMP'; throw e; },
    async resolve4() { throw new Error('not implemented'); },
    async resolve6() { throw new Error('not implemented'); },
  };
  const guard = await createAiCrawlerGuard(guardOptions({
    verification: { resolver: noDns },
    policy: { defaultAction: 'allow', onUnknown: 'log' },
  }));
  const decision = await guard.inspect({
    method: 'GET', url: '/', headers: { 'user-agent': 'DnsBot/1.0' }, socketIp: '203.0.113.7',
  });
  assert.equal(decision.verification.status, 'unknown');
  assert.equal(decision.action, 'log');
  await guard.close();
});

test('configFromEnv wires the hosted API without any code changes', async () => {
  const { configFromEnv } = await import('../src/index.js');
  const config = configFromEnv({
    AICG_SITE_ID: 'site_1',
    AICG_API_URL: 'https://api.example.com',
    AICG_SITE_KEY: 'aicg_live_x',
    AICG_TRUST_PROXY: '10.0.0.0/8,192.168.0.0/16',
    AICG_LOG_IP: 'hash',
  });
  assert.equal(config.siteId, 'site_1');
  assert.equal(config.reporting.endpoint, 'https://api.example.com');
  assert.equal(config.policySource.url, 'https://api.example.com/v1/policy');
  assert.equal(config.catalog.source, 'https://api.example.com/v1/crawlers');
  assert.deepEqual(config.trustProxy, ['10.0.0.0/8', '192.168.0.0/16']);
  assert.equal(config.logIp, 'hash');
  assert.equal(configFromEnv({ AICG_TRUST_PROXY: '2' }).trustProxy, 2);
  assert.equal(configFromEnv({}).trustProxy, undefined);
});
