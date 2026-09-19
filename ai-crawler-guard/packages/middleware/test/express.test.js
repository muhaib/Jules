import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { aiCrawlerGuard, createAiCrawlerGuard } from '../src/index.js';
import { guardOptions, listen } from './fixtures.js';

async function app(options = {}) {
  const guard = await createAiCrawlerGuard(guardOptions(options));
  const server = express();
  server.use(guard.express());
  server.get('/', (req, res) => res.send('content'));
  server.get('/post/1', (req, res) => res.json({ seenAs: req.aiCrawler?.crawler?.id ?? null }));
  const handle = await listen(server);
  return { guard, ...handle };
}

test('a blocked crawler never reaches the route handler', async () => {
  const { guard, url, close } = await app();
  const response = await fetch(url('/'), { headers: { 'user-agent': 'DnsBot/1.0' } });
  assert.equal(response.status, 403);
  assert.match(await response.text(), /DnsBot is not permitted/);
  await close();
  await guard.close();
});

test('an allowed crawler reaches the handler and is visible to it', async () => {
  const { guard, url, close } = await app({ policy: { defaultAction: 'allow' } });
  const response = await fetch(url('/post/1'), { headers: { 'user-agent': 'GoodBot/1.0' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { seenAs: 'goodbot' });
  await close();
  await guard.close();
});

test('ordinary visitors are unaffected', async () => {
  const { guard, url, close } = await app();
  const response = await fetch(url('/'), { headers: { 'user-agent': 'Mozilla/5.0' } });
  assert.equal(await response.text(), 'content');
  await close();
  await guard.close();
});

test('robots.txt is served with the owner\'s existing rules merged in', async () => {
  const { guard, url, close } = await app();
  const body = await (await fetch(url('/robots.txt'))).text();
  assert.match(body, /User-agent: \*\nDisallow: \/admin\//);
  assert.match(body, /User-agent: DnsBot\nDisallow: \/\n/);
  await close();
  await guard.close();
});

test('the licensing form posts and captures an inquiry end to end', async () => {
  const received = [];
  const { guard, url, close } = await app({
    policy: { defaultAction: 'allow', rules: { dnsbot: 'license' } },
    licensing: { publicUrl: 'http://127.0.0.1', onInquiry: async (i) => received.push(i) },
  });

  const page = await fetch(url('/archive/story'), { headers: { 'user-agent': 'DnsBot/1.0' } });
  assert.equal(page.status, 403);
  const html = await page.text();
  assert.match(html, /Request a licence/);

  const action = /<form method="post" action="([^"]+)"/.exec(html)[1];
  const submit = await fetch(url(action), {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Ann Lee', email: 'ann@lab.ai', intendedUse: 'training', message: 'full archive' }),
  });
  assert.equal(submit.status, 202);
  assert.match(await submit.text(), /Inquiry received/);
  assert.equal(received.length, 1);
  assert.equal(received[0].email, 'ann@lab.ai');
  await close();
  await guard.close();
});

test('the inquiry endpoint works when express.json() already parsed the body', async () => {
  const received = [];
  const guard = await createAiCrawlerGuard(guardOptions({
    licensing: { onInquiry: async (i) => received.push(i) },
  }));
  const server = express();
  server.use(express.json());
  server.use(guard.express());
  const { url, close } = await listen(server);
  const response = await fetch(url('/.well-known/ai-licensing/inquiry'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ name: 'Ann', email: 'ann@lab.ai' }),
  });
  assert.equal(response.status, 202);
  assert.equal(received.length, 1);
  await close();
  await guard.close();
});

test('the lazy helper passes traffic through if it cannot start', async () => {
  const errors = [];
  const middleware = aiCrawlerGuard({
    catalog: { source: { crawlers: [{ id: 'BROKEN UPPERCASE', robotsToken: 'x', userAgentPatterns: ['x'] }] } },
    onError: (e) => errors.push(e),
  });
  const server = express();
  server.use(middleware);
  server.get('/', (req, res) => res.send('still up'));
  const { url, close } = await listen(server);
  const response = await fetch(url('/'), { headers: { 'user-agent': 'DnsBot/1.0' } });
  assert.equal(await response.text(), 'still up');
  assert.equal(errors.length, 1);
  await close();
  await middleware.close();
});
