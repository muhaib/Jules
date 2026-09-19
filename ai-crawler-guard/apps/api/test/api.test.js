import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { client, createSite, registerOwner, reset, testServer, withKey } from './helpers.js';

let base;
let stop;

before(async () => {
  const server = await testServer();
  base = server.base;
  stop = server.stop;
});
after(async () => { await stop(); });
beforeEach(async () => { await reset(); });

const event = (overrides = {}) => ({
  ts: '2026-09-01T10:00:00.000Z',
  botId: 'gptbot',
  botName: 'GPTBot',
  operator: 'OpenAI',
  purpose: 'training',
  path: '/blog/post',
  method: 'GET',
  userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.2)',
  ip: '203.0.113.5',
  verification: 'verified',
  verificationMethod: 'cidr',
  verificationReason: 'ip_in_published_ranges',
  action: 'block',
  ruleSource: 'rules.gptbot',
  responseStatus: 403,
  ...overrides,
});

test('health check', async () => {
  const call = client(base);
  const response = await call('/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
});

test('register, whoami, logout', async () => {
  const call = client(base);
  const user = await registerOwner(call);
  assert.equal(user.email, 'owner@test.local');

  const me = await call('/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, 'owner@test.local');

  await call('/auth/logout', { method: 'POST' });
  assert.equal((await call('/auth/me')).status, 401);
});

test('a short password is rejected', async () => {
  const call = client(base);
  const response = await call('/auth/register', { method: 'POST', json: { email: 'a@b.co', password: 'short' } });
  assert.equal(response.status, 400);
  assert.equal(response.body.details.field, 'password');
});

test('duplicate registration is refused', async () => {
  const call = client(base);
  await registerOwner(call);
  const again = await call('/auth/register', {
    method: 'POST', json: { email: 'OWNER@test.local', password: 'a-long-enough-password' },
  });
  assert.equal(again.status, 409);
});

test('login with a wrong password fails the same way as an unknown account', async () => {
  const call = client(base);
  await registerOwner(call);
  const wrong = await call('/auth/login', { method: 'POST', json: { email: 'owner@test.local', password: 'nope-nope-nope' } });
  const missing = await call('/auth/login', { method: 'POST', json: { email: 'ghost@test.local', password: 'nope-nope-nope' } });
  assert.equal(wrong.status, 401);
  assert.equal(missing.status, 401);
  assert.deepEqual(wrong.body, missing.body);
});

test('a site key is returned once at creation and never again', async () => {
  const call = client(base);
  await registerOwner(call);
  const { site, siteKey } = await createSite(call);
  assert.match(siteKey, /^aicg_live_/);

  const fetched = await call(`/api/sites/${site.id}`);
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.site.key_hash, undefined);
  assert.equal(fetched.text.includes(siteKey), false);
  assert.match(fetched.body.site.key_prefix, /^aicg_live_/);
});

test('rotating a key invalidates the old one', async () => {
  const call = client(base);
  await registerOwner(call);
  const { site, siteKey } = await createSite(call);
  assert.equal((await call('/v1/whoami', { headers: withKey(siteKey) })).status, 200);

  const rotated = await call(`/api/sites/${site.id}/key`, { method: 'POST' });
  assert.match(rotated.body.siteKey, /^aicg_live_/);
  assert.notEqual(rotated.body.siteKey, siteKey);
  assert.equal((await call('/v1/whoami', { headers: withKey(siteKey) })).status, 401);
  assert.equal((await call('/v1/whoami', { headers: withKey(rotated.body.siteKey) })).status, 200);
});

test('ingest requires a valid site key', async () => {
  const call = client(base);
  assert.equal((await call('/v1/ingest', { method: 'POST', json: { events: [] } })).status, 401);
  assert.equal((await call('/v1/ingest', {
    method: 'POST', json: { events: [] }, headers: withKey('aicg_live_nonsense'),
  })).status, 401);
});

test('events are stored and repeated batches are deduplicated', async () => {
  const call = client(base);
  await registerOwner(call);
  const { site, siteKey } = await createSite(call);

  const batch = { events: [event(), event({ path: '/other', ts: '2026-09-01T10:00:01.000Z' })] };
  const first = await call('/v1/ingest', { method: 'POST', json: batch, headers: withKey(siteKey) });
  assert.equal(first.status, 202);
  assert.deepEqual(first.body, { accepted: 2, duplicates: 0 });

  // A retry of the same batch, which is exactly what the reporter does after
  // a network failure.
  const retry = await call('/v1/ingest', { method: 'POST', json: batch, headers: withKey(siteKey) });
  assert.deepEqual(retry.body, { accepted: 0, duplicates: 2 });

  const events = await call(`/api/sites/${site.id}/events`);
  assert.equal(events.body.events.length, 2);
});

test('a malformed event is rejected without storing the rest of the batch', async () => {
  const call = client(base);
  await registerOwner(call);
  const { site, siteKey } = await createSite(call);
  const response = await call('/v1/ingest', {
    method: 'POST',
    json: { events: [event(), { botId: '', path: '/x' }] },
    headers: withKey(siteKey),
  });
  assert.equal(response.status, 400);
  assert.equal((await call(`/api/sites/${site.id}/events`)).body.events.length, 0);
});

test('oversized batches are refused', async () => {
  const call = client(base);
  await registerOwner(call);
  const { siteKey } = await createSite(call);
  const events = Array.from({ length: 501 }, (_, i) => event({ path: `/p/${i}` }));
  const response = await call('/v1/ingest', { method: 'POST', json: { events }, headers: withKey(siteKey) });
  assert.equal(response.status, 413);
});

test('unknown verification states and actions are coerced, not trusted', async () => {
  const call = client(base);
  await registerOwner(call);
  const { site, siteKey } = await createSite(call);
  await call('/v1/ingest', {
    method: 'POST',
    json: { events: [event({ verification: 'definitely-real', action: 'promote' })] },
    headers: withKey(siteKey),
  });
  const { events } = (await call(`/api/sites/${site.id}/events`)).body;
  assert.equal(events[0].verification, 'unknown');
  assert.equal(events[0].action, 'log');
});

test('the overview aggregates by crawler, by page and by day', async () => {
  const call = client(base);
  await registerOwner(call);
  const { site, siteKey } = await createSite(call);
  const events = [
    event({ ts: '2026-09-01T10:00:00.000Z', botId: 'gptbot', path: '/a', action: 'block' }),
    event({ ts: '2026-09-01T11:00:00.000Z', botId: 'gptbot', path: '/a', action: 'block' }),
    event({ ts: '2026-09-02T10:00:00.000Z', botId: 'gptbot', path: '/b', action: 'block' }),
    event({ ts: '2026-09-02T10:00:00.000Z', botId: 'claudebot', botName: 'ClaudeBot', path: '/a', action: 'license' }),
    event({ ts: '2026-09-02T12:00:00.000Z', botId: 'ccbot', botName: 'CCBot', path: '/a', action: 'allow', verification: 'spoofed' }),
  ];
  await call('/v1/ingest', { method: 'POST', json: { events }, headers: withKey(siteKey) });

  const overview = (await call(
    `/api/sites/${site.id}/overview?from=2026-08-01T00:00:00Z&to=2026-10-01T00:00:00Z`,
  )).body;

  assert.equal(overview.totals.hits, 5);
  assert.equal(overview.totals.crawlers, 3);
  assert.equal(overview.totals.blocked, 3);
  assert.equal(overview.totals.licensed, 1);
  assert.equal(overview.totals.spoofed, 1);

  const gptbot = overview.byCrawler.find((row) => row.bot_id === 'gptbot');
  assert.equal(gptbot.hits, 3);
  assert.equal(gptbot.blocked, 3);
  assert.equal(gptbot.pages, 2);

  // /a was hit twice by gptbot and once each by claudebot and ccbot.
  const pageA = overview.byPage.find((row) => row.path === '/a');
  assert.equal(pageA.hits, 4);
  assert.equal(pageA.crawlers, 3);
  assert.equal(overview.byPage[0].path, '/a', 'pages are ordered by traffic');

  // 09-01: 2 blocked. 09-02: 1 blocked, 1 licensed, 1 allowed.
  assert.equal(overview.timeline.length, 4, 'one row per day per action');
  const firstDay = overview.timeline.filter((row) => row.day.startsWith('2026-09-01'));
  assert.deepEqual(firstDay, [{ day: '2026-09-01T00:00:00.000Z', action: 'block', hits: 2 }]);
  assert.equal(overview.byVerification.spoofed, 1);
  assert.equal(overview.byVerification.verified, 4);
});

test('the date range is respected', async () => {
  const call = client(base);
  await registerOwner(call);
  const { site, siteKey } = await createSite(call);
  await call('/v1/ingest', {
    method: 'POST',
    json: { events: [event({ ts: '2026-01-01T00:00:00.000Z' }), event({ ts: '2026-09-01T00:00:00.000Z', path: '/z' })] },
    headers: withKey(siteKey),
  });
  const narrow = (await call(`/api/sites/${site.id}/overview?from=2026-08-01T00:00:00Z&to=2026-10-01T00:00:00Z`)).body;
  assert.equal(narrow.totals.hits, 1);
});

test('events can be filtered and paged with a cursor', async () => {
  const call = client(base);
  await registerOwner(call);
  const { site, siteKey } = await createSite(call);
  const events = Array.from({ length: 5 }, (_, i) => event({
    ts: `2026-09-0${i + 1}T10:00:00.000Z`,
    botId: i % 2 ? 'ccbot' : 'gptbot',
    path: `/p/${i}`,
  }));
  await call('/v1/ingest', { method: 'POST', json: { events }, headers: withKey(siteKey) });

  const filtered = (await call(`/api/sites/${site.id}/events?botId=ccbot`)).body;
  assert.equal(filtered.events.length, 2);

  const page1 = (await call(`/api/sites/${site.id}/events?limit=2`)).body;
  assert.equal(page1.events.length, 2);
  assert.ok(page1.nextCursor);
  const page2 = (await call(`/api/sites/${site.id}/events?limit=2&before=${page1.nextCursor}`)).body;
  assert.equal(page2.events.length, 2);
  assert.equal(page1.events.some((e) => page2.events.some((o) => o.id === e.id)), false);
});

test('the policy round-trips and invalid policies are rejected before storage', async () => {
  const call = client(base);
  await registerOwner(call);
  const { site, siteKey } = await createSite(call);

  const initial = (await call(`/api/sites/${site.id}/policy`)).body.policy;
  assert.equal(initial.defaultAction, 'log', 'new sites start in observe-only mode');

  const update = await call(`/api/sites/${site.id}/policy`, {
    method: 'PUT',
    json: { policy: { defaultAction: 'log', rules: { gptbot: { action: 'block' }, ccbot: { action: 'license' } } } },
  });
  assert.equal(update.status, 200);
  assert.equal(update.body.policy.rules.gptbot.action, 'block');

  // The middleware sees the change on its next poll.
  const pulled = await call('/v1/policy', { headers: withKey(siteKey) });
  assert.equal(pulled.body.policy.rules.ccbot.action, 'license');

  const bad = await call(`/api/sites/${site.id}/policy`, {
    method: 'PUT', json: { policy: { rules: { 'no-such-bot': 'block' } } },
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error, 'invalid_policy');

  const unchanged = await call('/v1/policy', { headers: withKey(siteKey) });
  assert.equal(unchanged.body.policy.rules['no-such-bot'], undefined);
});

test('generated robots.txt matches the stored policy', async () => {
  const call = client(base);
  await registerOwner(call);
  const { site } = await createSite(call);
  await call(`/api/sites/${site.id}/policy`, {
    method: 'PUT', json: { policy: { defaultAction: 'allow', rules: { gptbot: 'block' } } },
  });
  const robots = await call(`/api/sites/${site.id}/robots.txt`);
  assert.match(robots.headers.get('content-type'), /text\/plain/);
  assert.match(robots.text, /User-agent: GPTBot\nDisallow: \/\n/);
  assert.match(robots.text, /User-agent: ClaudeBot/);
});

test('the middleware can pull the crawler catalog with its site key', async () => {
  const call = client(base);
  await registerOwner(call);
  const { siteKey } = await createSite(call);
  const response = await call('/v1/crawlers', { headers: withKey(siteKey) });
  assert.equal(response.status, 200);
  assert.ok(response.body.crawlers.some((c) => c.id === 'gptbot'));
});

test('an inquiry posted by the middleware is stored and listed', async () => {
  const call = client(base);
  await registerOwner(call);
  const { site, siteKey } = await createSite(call);

  const posted = await call('/v1/inquiries', {
    method: 'POST',
    headers: withKey(siteKey),
    json: {
      name: 'Dana Okafor', email: 'dana@northwind.example', organization: 'Northwind AI',
      intendedUse: 'training', message: 'Full archive, quarterly refresh.',
      crawlerId: 'claudebot', requestedPath: '/archive/2024',
    },
  });
  assert.equal(posted.status, 201);

  const listed = (await call(`/api/sites/${site.id}/inquiries`)).body.inquiries;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].email, 'dana@northwind.example');
  assert.equal(listed[0].status, 'new');
  assert.equal(listed[0].notified_at, null, 'no SMTP configured in tests');

  const patched = await call(`/api/sites/${site.id}/inquiries/${listed[0].id}`, {
    method: 'PATCH', json: { status: 'contacted', notes: 'Replied with terms.' },
  });
  assert.equal(patched.body.inquiry.status, 'contacted');
  assert.equal(patched.body.inquiry.notes, 'Replied with terms.');

  const badStatus = await call(`/api/sites/${site.id}/inquiries/${listed[0].id}`, {
    method: 'PATCH', json: { status: 'invented' },
  });
  assert.equal(badStatus.status, 400);
});

test('an inquiry without a usable email is refused', async () => {
  const call = client(base);
  await registerOwner(call);
  const { siteKey } = await createSite(call);
  const response = await call('/v1/inquiries', {
    method: 'POST', headers: withKey(siteKey), json: { name: 'Dana', email: 'nope' },
  });
  assert.equal(response.status, 400);
});

test('one owner cannot read or write another owner\'s site', async () => {
  const alice = client(base);
  await registerOwner(alice, 'alice@test.local');
  const { site: aliceSite, siteKey: aliceKey } = await createSite(alice, 'Alice Site');
  await alice('/v1/ingest', { method: 'POST', json: { events: [event()] }, headers: withKey(aliceKey) });

  const bob = client(base);
  await registerOwner(bob, 'bob@test.local');

  for (const path of ['', '/overview', '/events', '/policy', '/inquiries', '/robots.txt']) {
    const response = await bob(`/api/sites/${aliceSite.id}${path}`);
    assert.equal(response.status, 404, `bob reached ${path || '/'}`);
  }
  const write = await bob(`/api/sites/${aliceSite.id}/policy`, {
    method: 'PUT', json: { policy: { defaultAction: 'allow' } },
  });
  assert.equal(write.status, 404);

  const listed = (await bob('/api/sites')).body.sites;
  assert.equal(listed.length, 0);
});

test('site routes reject a non-uuid id instead of erroring', async () => {
  const call = client(base);
  await registerOwner(call);
  const response = await call('/api/sites/not-a-uuid/overview');
  assert.equal(response.status, 404);
});

test('dashboard routes require a session', async () => {
  const call = client(base);
  assert.equal((await call('/api/sites')).status, 401);
  assert.equal((await call('/api/crawlers')).status, 401);
});
