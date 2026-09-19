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

test('the licensing form works without @fastify/formbody registered', async () => {
  // Regression: Fastify parses JSON and nothing else, so the form the
  // licensing page actually submits arrived with an undefined body and the
  // inquiry was rejected as invalid.
  const received = [];
  const { app, guard } = await build({ licensing: { onInquiry: async (i) => received.push(i) } });
  const response = await app.inject({
    method: 'POST',
    url: '/.well-known/ai-licensing/inquiry',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    payload: 'name=Ann+Lee&email=ann%40lab.ai&intendedUse=training&message=full+archive',
  });
  assert.equal(response.statusCode, 202);
  assert.equal(received.length, 1);
  assert.equal(received[0].email, 'ann@lab.ai');
  assert.equal(received[0].message, 'full archive');
  await app.close();
  await guard.close();
});

test('a body-carrying request the guard ignores is still readable by the route', async () => {
  const guard = await createAiCrawlerGuard(guardOptions({ policy: { defaultAction: 'allow' } }));
  const app = Fastify({ logger: false });
  await app.register(guard.fastify, guard.fastifyOptions);
  app.post('/echo', async (request) => request.body);
  await app.ready();
  const response = await app.inject({
    method: 'POST', url: '/echo',
    headers: { 'content-type': 'application/json' },
    payload: { hello: 'world' },
  });
  assert.deepEqual(response.json(), { hello: 'world' }, 'the guard must not consume other request bodies');
  await app.close();
  await guard.close();
});
