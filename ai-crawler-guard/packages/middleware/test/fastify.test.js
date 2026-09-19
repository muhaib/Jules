import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { createAiCrawlerGuard } from '../src/index.js';
import { guardOptions } from './fixtures.js';

async function build(options = {}) {
  const guard = await createAiCrawlerGuard(guardOptions(options));
  const app = Fastify({ logger: false });
  await app.register(guard.fastify, guard.fastifyOptions);
  app.get('/', async () => 'content');
  app.get('/post/1', async (request) => ({ seenAs: request.aiCrawler?.crawler?.id ?? null }));
  await app.ready();
  return { app, guard };
}

test('a blocked crawler is stopped in onRequest, before routing', async () => {
  const { app, guard } = await build();
  const response = await app.inject({ method: 'GET', url: '/', headers: { 'user-agent': 'DnsBot/1.0' } });
  assert.equal(response.statusCode, 403);
  assert.match(response.body, /DnsBot is not permitted/);
  await app.close();
  await guard.close();
});

test('an allowed crawler reaches the route and is attached to the request', async () => {
  const { app, guard } = await build({ policy: { defaultAction: 'allow' } });
  const response = await app.inject({ method: 'GET', url: '/post/1', headers: { 'user-agent': 'GoodBot/1.0' } });
  assert.deepEqual(response.json(), { seenAs: 'goodbot' });
  await app.close();
  await guard.close();
});

test('robots.txt is served by the plugin without a route', async () => {
  const { app, guard } = await build();
  const response = await app.inject({ method: 'GET', url: '/robots.txt' });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /User-agent: DnsBot/);
  await app.close();
  await guard.close();
});

test('the inquiry endpoint uses Fastify\'s parsed body', async () => {
  const received = [];
  const { app, guard } = await build({ licensing: { onInquiry: async (i) => received.push(i) } });
  const response = await app.inject({
    method: 'POST',
    url: '/.well-known/ai-licensing/inquiry',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    payload: { name: 'Ann', email: 'ann@lab.ai', intendedUse: 'rag' },
  });
  assert.equal(response.statusCode, 202);
  assert.equal(received[0].intendedUse, 'rag');
  await app.close();
  await guard.close();
});

test('unmatched traffic is untouched', async () => {
  const { app, guard } = await build();
  const response = await app.inject({ method: 'GET', url: '/', headers: { 'user-agent': 'Mozilla/5.0' } });
  assert.equal(response.body, 'content');
  await app.close();
  await guard.close();
});
