import test from 'node:test';
import assert from 'node:assert/strict';
import { buildManagedSection, buildRobotsTxt, globToRobotsPath, mergeRobots } from '../src/robots.js';
import { createPolicy } from '../src/policy.js';
import { testCatalog } from './helpers.js';

const catalog = testCatalog();
const opts = { catalog, generatedAt: '2026-01-01' };

function section(policyConfig, extra = {}) {
  return buildManagedSection({ ...opts, ...extra, policy: createPolicy(policyConfig, { catalog }) });
}

function groupFor(text, token) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.toLowerCase() === `user-agent: ${token.toLowerCase()}`);
  assert.notEqual(start, -1, `no group for ${token}`);
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^user-agent:/i.test(line)) continue;
    if (!line.trim() || line.startsWith('#')) {
      if (out.length) break;
      continue;
    }
    out.push(line);
  }
  return out;
}

test('a blocked crawler gets a full disallow', () => {
  const text = section({ defaultAction: 'allow', rules: { dnsbot: 'block' } });
  assert.deepEqual(groupFor(text, 'DnsBot'), ['Disallow: /']);
});

test('an allowed crawler gets the canonical empty disallow', () => {
  const text = section({ defaultAction: 'allow' });
  assert.deepEqual(groupFor(text, 'DnsBot'), ['Disallow:']);
});

test('a licensed crawler is disallowed and pointed at the licensing page', () => {
  const text = section({ rules: { dnsbot: 'license' } }, { licensingUrl: 'https://example.com/.well-known/ai-licensing' });
  assert.deepEqual(groupFor(text, 'DnsBot'), ['Disallow: /']);
  assert.match(text, /# content licensing: https:\/\/example\.com/);
});

test('partial restrictions emit Disallow lines followed by Allow: /', () => {
  const text = section({
    rules: { dnsbot: { action: 'allow', paths: [{ match: '/premium/', action: 'license' }, { match: '/internal/', action: 'block' }] } },
  });
  // Most-specific-match wins in RFC 9309, so the trailing Allow does not undo
  // the Disallow lines above it.
  assert.deepEqual(groupFor(text, 'DnsBot'), ['Disallow: /premium/', 'Disallow: /internal/', 'Allow: /']);
});

test('crawlers with identical directives share one group', () => {
  const text = section({ defaultAction: 'block' });
  const blockGroups = text.split('\n\n').filter((b) => b.includes('Disallow: /') && !b.includes('Disallow:\n'));
  assert.equal(blockGroups.length, 1);
  for (const token of ['DnsBot', 'CidrBot', 'OpenBot', 'Example-Extended']) {
    assert.ok(text.includes(`User-agent: ${token}`), `${token} missing`);
  }
});

test('robots-only tokens appear in robots.txt even though they never match traffic', () => {
  const text = section({ defaultAction: 'allow', rules: { 'robots-only': 'block' } });
  assert.deepEqual(groupFor(text, 'Example-Extended'), ['Disallow: /']);
});

test('glob patterns translate to the robots.txt path dialect', () => {
  assert.equal(globToRobotsPath('/admin'), '/admin$');
  assert.equal(globToRobotsPath('/admin/'), '/admin/');
  assert.equal(globToRobotsPath('/blog/**'), '/blog/*');
  assert.equal(globToRobotsPath('/blog/*'), '/blog/*');
});

test('merging replaces our groups and leaves the owner\'s rules alone', () => {
  const existing = [
    '# hand-written',
    'User-agent: *',
    'Disallow: /admin/',
    'Crawl-delay: 2',
    '',
    'User-agent: DnsBot',
    'Disallow:',
    '',
    'Sitemap: https://example.com/sitemap.xml',
  ].join('\n');
  const merged = buildRobotsTxt({ ...opts, policy: createPolicy({ rules: { dnsbot: 'block' } }, { catalog }), existing });
  assert.ok(merged.includes('User-agent: *'));
  assert.ok(merged.includes('Disallow: /admin/'));
  assert.ok(merged.includes('Crawl-delay: 2'));
  assert.equal(merged.match(/User-agent: DnsBot/g).length, 1, 'exactly one DnsBot group survives');
  assert.deepEqual(groupFor(merged, 'DnsBot'), ['Disallow: /']);
});

test('sitemap directives survive the removal of a group they were written inside', () => {
  const existing = 'User-agent: DnsBot\nDisallow:\nSitemap: https://example.com/sitemap.xml\n';
  const merged = buildRobotsTxt({ ...opts, policy: createPolicy({}, { catalog }), existing });
  assert.ok(merged.includes('Sitemap: https://example.com/sitemap.xml'));
});

test('regenerating is idempotent - the managed block is replaced, not stacked', () => {
  const policy = createPolicy({ rules: { dnsbot: 'block' } }, { catalog });
  const once = buildRobotsTxt({ ...opts, policy, existing: 'User-agent: *\nDisallow:\n' });
  const twice = buildRobotsTxt({ ...opts, policy, existing: once });
  assert.equal(once, twice);
  assert.equal(twice.match(/BEGIN ai-crawler-guard/g).length, 1);
});

test('a group with both managed and unmanaged agents keeps the unmanaged one', () => {
  const merged = mergeRobots(
    'User-agent: DnsBot\nUser-agent: SomeOtherBot\nDisallow: /x\n',
    '# BEGIN ai-crawler-guard\nUser-agent: DnsBot\nDisallow: /\n# END ai-crawler-guard\n',
    ['DnsBot'],
  );
  assert.ok(merged.includes('User-agent: SomeOtherBot'));
  assert.equal(merged.match(/User-agent: DnsBot/g).length, 1);
});

test('sitemaps can be added to the managed section', () => {
  const text = section({}, { sitemaps: ['https://example.com/sitemap.xml'] });
  assert.ok(text.includes('Sitemap: https://example.com/sitemap.xml'));
});
