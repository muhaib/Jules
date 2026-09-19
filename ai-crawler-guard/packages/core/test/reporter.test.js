import test from 'node:test';
import assert from 'node:assert/strict';
import { createReporter } from '../src/reporter.js';

test('a reporter with no destination is inert', () => {
  const reporter = createReporter({});
  assert.equal(reporter.enabled, false);
  reporter.record({ botId: 'x' });
  assert.equal(reporter.pending, 0);
});

test('events are batched and delivered to a sink', async () => {
  const batches = [];
  const reporter = createReporter({ sink: async (b) => batches.push(b), batchSize: 3, flushIntervalMs: 0 });
  for (let i = 0; i < 3; i++) reporter.record({ botId: `b${i}` });
  await reporter.flush();
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 3);
  assert.ok(batches[0][0].ts, 'a timestamp is stamped on ingest');
});

test('the queue is bounded and drops are counted', async () => {
  const reporter = createReporter({ sink: async () => {}, batchSize: 10_000, flushIntervalMs: 0, maxQueue: 10 });
  for (let i = 0; i < 25; i++) reporter.record({ botId: `b${i}` });
  assert.equal(reporter.pending, 10);
  assert.equal(reporter.stats.dropped, 15);
});

test('recording never throws, even when delivery fails', async () => {
  const errors = [];
  const reporter = createReporter({
    sink: async () => { throw new Error('sink down'); },
    batchSize: 1,
    flushIntervalMs: 0,
    maxAttempts: 2,
    onError: (e) => errors.push(e),
  });
  reporter.record({ botId: 'x' });
  await reporter.flush();
  assert.ok(errors.length >= 1);
  assert.equal(reporter.stats.failedBatches, 1);
  assert.equal(reporter.stats.dropped, 1);
});

test('a rejected site key is not retried', async () => {
  let calls = 0;
  const reporter = createReporter({
    endpoint: 'https://api.example.com',
    siteKey: 'bad',
    batchSize: 1,
    flushIntervalMs: 0,
    maxAttempts: 5,
    fetchImpl: async () => { calls++; return { ok: false, status: 401 }; },
  });
  reporter.record({ botId: 'x' });
  await reporter.flush();
  assert.equal(calls, 1, 'a 401 is permanent; retrying it just wastes requests');
});

test('events are posted to /v1/ingest with the site key', async () => {
  const seen = [];
  const reporter = createReporter({
    endpoint: 'https://api.example.com/',
    siteKey: 'aicg_test',
    batchSize: 1,
    flushIntervalMs: 0,
    fetchImpl: async (url, init) => {
      seen.push({ url, init });
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    },
  });
  reporter.record({ botId: 'gptbot' });
  await reporter.flush();
  assert.equal(seen[0].url, 'https://api.example.com/v1/ingest');
  assert.equal(seen[0].init.headers.authorization, 'Bearer aicg_test');
  assert.deepEqual(JSON.parse(seen[0].init.body).events[0].botId, 'gptbot');
});

test('close flushes what is still queued', async () => {
  const batches = [];
  const reporter = createReporter({ sink: async (b) => batches.push(b), batchSize: 100, flushIntervalMs: 50 });
  reporter.record({ botId: 'x' });
  await reporter.close();
  assert.equal(batches.length, 1);
});
