import test from 'node:test';
import assert from 'node:assert/strict';
import { compileCatalog, defaultCatalogSource } from '../src/catalog.js';
import { detect, detectAll } from '../src/detect.js';
import { testCatalog } from './helpers.js';

const shipped = compileCatalog(defaultCatalogSource());

test('matching is case-insensitive and substring-based', () => {
  assert.equal(detect('gptbot/1.2', shipped).crawler.id, 'gptbot');
  assert.equal(detect('Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)', shipped).crawler.id, 'gptbot');
});

test('the most specific signature wins', () => {
  const ua = 'Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +https://anthropic.com)';
  assert.equal(detect(ua, shipped).crawler.id, 'claude-searchbot');
  assert.equal(detect('Mozilla/5.0 (compatible; ClaudeBot/1.0)', shipped).crawler.id, 'claudebot');
});

test('ordinary browsers do not match', () => {
  const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';
  assert.equal(detect(ua, shipped), null);
});

test('empty and missing user-agents do not match', () => {
  assert.equal(detect('', shipped), null);
  assert.equal(detect(undefined, shipped), null);
  assert.deepEqual(detectAll(null, shipped), []);
});

test('regex signatures are supported', () => {
  const catalog = testCatalog();
  assert.equal(detect('open-bot/3 (+http://example.com)', catalog).crawler.id, 'openbot');
});

test('overlapping matches are reported, not silently dropped', () => {
  const catalog = compileCatalog({
    crawlers: [
      { id: 'generic', robotsToken: 'Bot', userAgentPatterns: ['bot'] },
      { id: 'specific', robotsToken: 'SuperBot', userAgentPatterns: ['superbot'] },
    ],
  });
  const result = detect('SuperBot/1.0', catalog);
  assert.equal(result.crawler.id, 'specific');
  assert.deepEqual(result.alsoMatched, ['generic']);
});

test('robots-only tokens never match a user-agent header', () => {
  assert.equal(detect('Mozilla/5.0 Google-Extended', shipped), null);
});
