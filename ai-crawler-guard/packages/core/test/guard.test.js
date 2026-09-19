import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuard } from '../src/guard.js';
import { fakeResolver } from './helpers.js';

const CATALOG = {
  version: 'test',
  crawlers: [
    {
      id: 'dnsbot', name: 'DnsBot', operator: 'Example', purpose: 'training',
      robotsToken: 'DnsBot', userAgentPatterns: ['DnsBot'],
      verification: { methods: ['dns'], hostnameSuffixes: ['.crawl.example.com'] },
    },
    {
      id: 'openbot', name: 'OpenBot', operator: 'Example', purpose: 'other',
      robotsToken: 'OpenBot', userAgentPatterns: ['OpenBot'],
      verification: { methods: [] },
    },
  ],
};

const GOOD_DNS = fakeResolver({
  ptr: { '203.0.113.7': ['c7.crawl.example.com'] },
  a: { 'c7.crawl.example.com': ['203.0.113.7'] },
});

async function makeGuard(overrides = {}) {
  const events = [];
  const guard = await createGuard({
    siteId: 'site_test',
    catalog: { source: CATALOG },
    verification: { resolver: GOOD_DNS },
    reporting: { sink: async (batch) => events.push(...batch), batchSize: 1, flushIntervalMs: 0 },
    robots: { serve: true },
    licensing: { publicUrl: 'https://example.com', branding: { siteName: 'Example' } },
    ...overrides,
  });
  return { guard, events };
}

const req = (overrides = {}) => ({
  method: 'GET',
  url: '/',
  headers: {},
  socketIp: '203.0.113.7',
  ...overrides,
});

test('a request with no crawler signature passes straight through', async () => {
  const { guard, events } = await makeGuard();
  const decision = await guard.inspect(req({ headers: { 'user-agent': 'Mozilla/5.0' } }));
  assert.equal(decision.matched, false);
  assert.equal(decision.action, 'ignore');
  assert.equal(decision.response, null);
  await guard.close();
  assert.equal(events.length, 0, 'human traffic is not logged');
});

test('a verified crawler is logged even when it is allowed', async () => {
  const { guard, events } = await makeGuard({ policy: { defaultAction: 'allow' } });
  const decision = await guard.inspect(req({ url: '/post/1', headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(decision.action, 'allow');
  assert.equal(decision.response, null);
  await guard.close();
  assert.equal(events.length, 1);
  assert.deepEqual(
    { botId: events[0].botId, path: events[0].path, verification: events[0].verification, action: events[0].action },
    { botId: 'dnsbot', path: '/post/1', verification: 'verified', action: 'allow' },
  );
});

test('a blocked crawler gets a 403 that names the bot', async () => {
  const { guard } = await makeGuard({ policy: { rules: { dnsbot: 'block' } } });
  const decision = await guard.inspect(req({ headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(decision.action, 'block');
  assert.equal(decision.response.status, 403);
  assert.match(decision.response.body, /DnsBot is not permitted/);
  assert.match(decision.response.headers['x-ai-crawler-guard'], /block; bot=dnsbot/);
  await guard.close();
});

test('a licensed crawler gets the landing page instead of the content', async () => {
  const { guard } = await makeGuard({ policy: { rules: { dnsbot: 'license' } } });
  const decision = await guard.inspect(req({ url: '/archive/x', headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(decision.kind, 'licensing');
  assert.equal(decision.response.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(decision.response.body, /Request a licence/);
  assert.match(decision.response.body, /\/archive\/x/);
  await guard.close();
});

test('a spoofed user-agent is blocked even when the bot is allowed', async () => {
  const { guard, events } = await makeGuard({ policy: { defaultAction: 'allow' } });
  const decision = await guard.inspect(req({ socketIp: '66.66.66.66', headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(decision.verification.status, 'spoofed');
  assert.equal(decision.action, 'block');
  await guard.close();
  assert.equal(events[0].verification, 'spoofed');
  assert.equal(events[0].verificationReason, 'no_ptr_record');
});

test('a blocked crawler can still read robots.txt and the licensing page', async () => {
  const { guard } = await makeGuard({ policy: { defaultAction: 'block' } });
  const robots = await guard.inspect(req({ url: '/robots.txt', headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(robots.kind, 'robots');
  assert.equal(robots.response.status, 200);
  assert.match(robots.response.body, /User-agent: DnsBot/);

  const page = await guard.inspect(req({
    url: '/.well-known/ai-licensing',
    headers: { 'user-agent': 'DnsBot/1.0', accept: 'text/html' },
  }));
  assert.equal(page.response.status, 200);
  await guard.close();
});

test('the well-known path serves JSON when JSON is asked for', async () => {
  const { guard } = await makeGuard({ policy: { rules: { dnsbot: 'license' } } });
  const decision = await guard.inspect(req({
    url: '/.well-known/ai-licensing',
    headers: { accept: 'application/json' },
  }));
  const doc = JSON.parse(decision.response.body);
  assert.equal(doc.crawlers.find((c) => c.id === 'dnsbot').action, 'license');
  assert.match(doc.statement, /Payment is not handled here/);
  await guard.close();
});

test('an inquiry is delivered to the configured handler', async () => {
  const received = [];
  const { guard } = await makeGuard({
    licensing: { publicUrl: 'https://example.com', onInquiry: async (i) => received.push(i) },
  });
  const decision = await guard.inspect(req({
    method: 'POST',
    url: '/.well-known/ai-licensing/inquiry',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'name=Ann&email=ann%40lab.ai&intendedUse=training&message=whole+archive&crawlerId=dnsbot',
    socketIp: '9.9.9.9',
  }));
  assert.equal(decision.response.status, 202);
  assert.equal(received.length, 1);
  assert.equal(received[0].email, 'ann@lab.ai');
  assert.equal(received[0].intendedUse, 'training');
  assert.equal(received[0].siteId, 'site_test');
  await guard.close();
});

test('an inquiry can be submitted as JSON and answered as JSON', async () => {
  const received = [];
  const { guard } = await makeGuard({
    licensing: { onInquiry: async (i) => received.push(i) },
  });
  const decision = await guard.inspect(req({
    method: 'POST',
    url: '/.well-known/ai-licensing/inquiry',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ name: 'Ann', email: 'ann@lab.ai' }),
  }));
  assert.equal(decision.response.status, 202);
  assert.deepEqual(JSON.parse(decision.response.body), { status: 'received' });
  assert.equal(received.length, 1);
  await guard.close();
});

test('an invalid inquiry re-renders the form with the errors', async () => {
  const received = [];
  const { guard } = await makeGuard({ licensing: { onInquiry: async (i) => received.push(i) } });
  const decision = await guard.inspect(req({
    method: 'POST',
    url: '/.well-known/ai-licensing/inquiry',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'name=Ann&email=not-an-email',
  }));
  assert.equal(decision.response.status, 400);
  assert.match(decision.response.body, /does not look valid/);
  assert.equal(received.length, 0);
  await guard.close();
});

test('a honeypot hit looks like success but is never delivered', async () => {
  const received = [];
  const { guard } = await makeGuard({ licensing: { onInquiry: async (i) => received.push(i) } });
  const decision = await guard.inspect(req({
    method: 'POST',
    url: '/.well-known/ai-licensing/inquiry',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'name=Ann&email=ann%40lab.ai&website=http%3A%2F%2Fspam',
  }));
  assert.equal(decision.response.status, 202);
  assert.equal(received.length, 0);
  await guard.close();
});

test('the inquiry form is rate limited per address', async () => {
  const { guard } = await makeGuard({
    licensing: { onInquiry: async () => {}, rateLimit: { max: 2, windowMs: 60_000 } },
  });
  const send = () => guard.inspect(req({
    method: 'POST',
    url: '/.well-known/ai-licensing/inquiry',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'name=Ann&email=ann%40lab.ai',
    socketIp: '9.9.9.9',
  }));
  assert.equal((await send()).response.status, 202);
  assert.equal((await send()).response.status, 202);
  assert.equal((await send()).response.status, 429);
  await guard.close();
});

test('an inquiry with nowhere to go reports an error instead of failing silently', async () => {
  const errors = [];
  const { guard } = await makeGuard({ reporting: false, onError: (e) => errors.push(e) });
  await guard.inspect(req({
    method: 'POST',
    url: '/.well-known/ai-licensing/inquiry',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'name=Ann&email=ann%40lab.ai',
  }));
  assert.match(errors[0].message, /no delivery is configured/);
  await guard.close();
});

test('background verification answers immediately and warms the cache', async () => {
  const { guard } = await makeGuard({
    policy: { defaultAction: 'allow' },
    verification: { resolver: GOOD_DNS, mode: 'background' },
  });
  const first = await guard.inspect(req({ headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(first.verification.status, 'unknown');
  assert.equal(first.verification.reason, 'verification_pending');
  await new Promise((r) => setImmediate(r));
  const second = await guard.inspect(req({ headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(second.verification.status, 'verified');
  await guard.close();
});

test('forwarding headers are ignored unless a proxy is trusted', async () => {
  const { guard } = await makeGuard({ policy: { defaultAction: 'allow' } });
  const decision = await guard.inspect(req({
    headers: { 'user-agent': 'DnsBot/1.0', 'x-forwarded-for': '203.0.113.7' },
    socketIp: '66.66.66.66',
  }));
  assert.equal(decision.clientIp, '66.66.66.66');
  assert.equal(decision.verification.status, 'spoofed', 'a claimed XFF cannot buy verification');
  await guard.close();
});

test('logIp: hash stores a stable pseudonym instead of the address', async () => {
  const { guard, events } = await makeGuard({ logIp: 'hash', ipSalt: 'fixed', policy: { defaultAction: 'allow' } });
  await guard.inspect(req({ headers: { 'user-agent': 'DnsBot/1.0' } }));
  await guard.inspect(req({ headers: { 'user-agent': 'DnsBot/1.0' } }));
  await guard.close();
  assert.match(events[0].ip, /^sha256:[0-9a-f]{32}$/);
  assert.equal(events[0].ip, events[1].ip);
});

test('logIp: none omits the address entirely', async () => {
  const { guard, events } = await makeGuard({ logIp: 'none', policy: { defaultAction: 'allow' } });
  await guard.inspect(req({ headers: { 'user-agent': 'DnsBot/1.0' } }));
  await guard.close();
  assert.equal(events[0].ip, null);
});

test('a remote policy is used when it loads', async () => {
  const { guard } = await makeGuard({
    policy: { defaultAction: 'allow' },
    policySource: { url: 'https://api.example.com/v1/policy', siteKey: 'k', refreshMs: 0 },
    fetchImpl: async () => ({ ok: true, json: async () => ({ policy: { rules: { dnsbot: 'block' } } }) }),
  });
  const decision = await guard.inspect(req({ headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(decision.action, 'block');
  await guard.close();
});

test('an unreachable policy service falls back to the local policy, not to open', async () => {
  const errors = [];
  const { guard } = await makeGuard({
    policy: { defaultAction: 'block' },
    policySource: { url: 'https://api.example.com/v1/policy', siteKey: 'k', refreshMs: 0 },
    fetchImpl: async () => { throw new Error('network down'); },
    onError: (e) => errors.push(e),
  });
  const decision = await guard.inspect(req({ headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(decision.action, 'block');
  assert.ok(errors.length >= 1);
  await guard.close();
});

test('robots.txt reflects the live policy', async () => {
  const { guard } = await makeGuard({ policy: { defaultAction: 'allow' } });
  assert.match(guard.robotsTxt(), /User-agent: DnsBot\nUser-agent: OpenBot\nDisallow:\n/);
  guard.setPolicy({ rules: { dnsbot: 'block' }, defaultAction: 'allow' });
  assert.match(guard.robotsTxt(), /User-agent: DnsBot\nDisallow: \/\n/);
  await guard.close();
});

test('query strings do not affect path matching', async () => {
  const { guard } = await makeGuard({
    policy: { rules: { dnsbot: { action: 'allow', paths: [{ match: '/premium/', action: 'block' }] } } },
  });
  const decision = await guard.inspect(req({ url: '/premium/report?utm=x', headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(decision.action, 'block');
  assert.equal(decision.pathname, '/premium/report');
  await guard.close();
});

test('an unverifiable crawler is still detected, logged and actionable', async () => {
  const { guard, events } = await makeGuard({ policy: { rules: { openbot: 'block' } } });
  const decision = await guard.inspect(req({ headers: { 'user-agent': 'OpenBot/1.0' } }));
  assert.equal(decision.verification.status, 'unverifiable');
  assert.equal(decision.action, 'block');
  await guard.close();
  assert.equal(events[0].botId, 'openbot');
});

test('a guard whose hosted catalog is down still starts and still enforces', async () => {
  const errors = [];
  const guard = await createGuard({
    catalog: { source: 'https://api.example.com/v1/crawlers', siteKey: 'aicg_live_x' },
    fetchImpl: async () => ({ ok: false, status: 503 }),
    verification: { resolver: GOOD_DNS },
    reporting: false,
    policy: { defaultAction: 'log', rules: { gptbot: 'block' } },
    onError: (error) => errors.push(error),
  });
  const decision = await guard.inspect({
    method: 'GET', url: '/', headers: { 'user-agent': 'GPTBot/1.2' }, socketIp: '203.0.113.7',
  });
  assert.equal(decision.action, 'block', 'the bundled signature list still matched GPTBot');
  assert.ok(errors.some((error) => /503/.test(error.message)));
  await guard.close();
});

test('a blocked crawler can reach robots.txt even when the guard does not serve it', async () => {
  // Regression: with robots.serve off (the default), /robots.txt is served by
  // the application, so the request has to get past the guard to reach it.
  // Blocking it left blocked crawlers with no way to read the policy.
  const { guard, events } = await makeGuard({ robots: undefined, policy: { defaultAction: 'block' } });
  const decision = await guard.inspect(req({ url: '/robots.txt', headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(decision.response, null, 'the request passes through to the app');
  assert.equal(decision.action, 'allow');
  assert.equal(decision.source, 'reserved_path');
  await guard.close();
  assert.equal(events.length, 1, 'the hit is still detected and logged');
  assert.equal(events[0].path, '/robots.txt');
});

test('the licensing endpoints stay reachable for a blocked crawler when licensing is off', async () => {
  const { guard } = await makeGuard({ policy: { defaultAction: 'block' }, licensing: { enabled: false } });
  for (const url of ['/.well-known/ai-licensing', '/.well-known/ai-licensing/inquiry']) {
    const decision = await guard.inspect(req({ url, headers: { 'user-agent': 'DnsBot/1.0' } }));
    assert.notEqual(decision.action, 'block', `${url} was blocked`);
  }
  await guard.close();
});

test('a site-wide path rule can tighten a crawler\'s outcome but never loosen it', async () => {
  const { guard } = await makeGuard({
    policy: {
      defaultAction: 'log',
      pathRules: [{ match: '/public/', action: 'allow' }, { match: '/internal/', action: 'block' }],
      rules: { dnsbot: 'block', openbot: 'allow' },
    },
  });
  const loosened = await guard.inspect(req({ url: '/public/x', headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(loosened.action, 'block', 'a generic allow must not un-block an explicitly blocked crawler');

  const tightened = await guard.inspect(req({ url: '/internal/x', headers: { 'user-agent': 'OpenBot/1.0' } }));
  assert.equal(tightened.action, 'block');
  assert.equal(tightened.source, 'pathRules');
  await guard.close();
});

test('a per-crawler path rule may still loosen that crawler\'s own action', async () => {
  const { guard } = await makeGuard({
    policy: { rules: { dnsbot: { action: 'block', paths: [{ match: '/press/', action: 'allow' }] } } },
  });
  const pressRoom = await guard.inspect(req({ url: '/press/release', headers: { 'user-agent': 'DnsBot/1.0' } }));
  assert.equal(pressRoom.action, 'allow', 'block everything except the press room is a legitimate policy');
  await guard.close();
});

test('a request with no resolvable client IP reports the problem once', async () => {
  const errors = [];
  const { guard } = await makeGuard({ policy: { defaultAction: 'log' }, onError: (e) => errors.push(e) });
  // No socketIp and no trusted proxy: this is what a Next.js middleware looks
  // like on Next 15, where NextRequest no longer carries `ip`.
  await guard.inspect({ method: 'GET', url: '/', headers: { 'user-agent': 'DnsBot/1.0' } });
  await guard.inspect({ method: 'GET', url: '/b', headers: { 'user-agent': 'DnsBot/1.0' } });
  assert.equal(errors.length, 1, 'reported once, not once per request');
  assert.match(errors[0].message, /no client IP/);
  await guard.close();
});

test('a policy naming a crawler this catalog does not have is degraded, not rejected', async () => {
  const errors = [];
  const guard = await createGuard({
    catalog: { source: CATALOG },
    verification: { resolver: GOOD_DNS },
    reporting: false,
    policy: { defaultAction: 'log' },
    policySource: { url: 'https://api.example.com/v1/policy', siteKey: 'k', refreshMs: 0 },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ policy: { defaultAction: 'log', rules: { dnsbot: 'block', retiredbot: 'block' } } }),
    }),
    onError: (error) => errors.push(error),
  });
  const decision = await guard.inspect({
    method: 'GET', url: '/', headers: { 'user-agent': 'DnsBot/1.0' }, socketIp: '203.0.113.7',
  });
  assert.equal(decision.action, 'block', 'the rules that are still valid are applied');
  assert.ok(errors.some((e) => /unknown crawler "retiredbot"/.test(e.message)));
  await guard.close();
});
