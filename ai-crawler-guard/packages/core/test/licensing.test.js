import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, licensingDescriptor, parseInquiry, renderLicensingPage } from '../src/licensing.js';
import { testCatalog } from './helpers.js';

const catalog = testCatalog();

test('the landing page names the crawler and is not indexable', () => {
  const html = renderLicensingPage({
    crawler: catalog.byId.get('dnsbot'),
    branding: { siteName: 'Example Press', contactEmail: 'licensing@example.com' },
    inquiryPath: '/.well-known/ai-licensing/inquiry',
    pathname: '/archive/story',
  });
  assert.match(html, /DnsBot/);
  assert.match(html, /\/archive\/story/);
  assert.match(html, /noindex,nofollow/);
  assert.match(html, /licensing@example\.com/);
  assert.match(html, /<form method="post" action="\/\.well-known\/ai-licensing\/inquiry">/);
});

test('the page makes clear that nothing is charged', () => {
  const html = renderLicensingPage({ crawler: null, inquiryPath: '/x', pathname: '/' });
  assert.match(html, /nothing is charged/i);
  assert.doesNotMatch(html, /card number|checkout|stripe|pay now/i);
});

test('user-controlled values are escaped', () => {
  const html = renderLicensingPage({
    crawler: null,
    inquiryPath: '/x',
    pathname: '/"><script>alert(1)</script>',
    branding: { siteName: '<img src=x onerror=1>' },
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;script&gt;/);
});

test('escapeHtml covers the attribute-breaking characters', () => {
  assert.equal(escapeHtml(`<&">'`), '&lt;&amp;&quot;&gt;&#39;');
});

test('a failed submission keeps what the person typed', () => {
  const html = renderLicensingPage({
    crawler: null,
    inquiryPath: '/x',
    pathname: '/',
    errors: ['An email address is required.'],
    values: { name: 'Ann Lee', message: 'full archive' },
  });
  assert.match(html, /An email address is required/);
  assert.match(html, /value="Ann Lee"/);
  assert.match(html, /full archive<\/textarea>/);
});

test('inquiries require a name and a plausible email', () => {
  assert.equal(parseInquiry({}).ok, false);
  assert.equal(parseInquiry({ name: 'Ann' }).ok, false);
  assert.equal(parseInquiry({ name: 'Ann', email: 'nope' }).ok, false);
  assert.equal(parseInquiry({ name: 'Ann', email: 'ann@lab.ai' }).ok, true);
});

test('the honeypot field marks a submission as spam without telling the sender', () => {
  const result = parseInquiry({ name: 'Ann', email: 'ann@lab.ai', website: 'http://spam' });
  assert.equal(result.ok, false);
  assert.equal(result.spam, true);
});

test('oversized fields are truncated rather than rejected', () => {
  const result = parseInquiry({ name: 'A'.repeat(500), email: 'ann@lab.ai', message: 'B'.repeat(9000) });
  assert.equal(result.ok, true);
  assert.equal(result.value.name.length, 120);
  assert.equal(result.value.message.length, 2000);
});

test('an unrecognised intended use falls back to "other" instead of failing', () => {
  assert.equal(parseInquiry({ name: 'A', email: 'a@b.co', intendedUse: 'nonsense' }).value.intendedUse, 'other');
});

test('the machine-readable descriptor states that no payment happens here', () => {
  const doc = licensingDescriptor({
    branding: { siteName: 'Example', contactEmail: 'a@b.co' },
    inquiryUrl: 'https://example.com/.well-known/ai-licensing/inquiry',
    policySummary: [{ id: 'dnsbot', action: 'license' }],
  });
  assert.match(doc.statement, /Payment is not handled here/);
  assert.equal(doc.inquiryMethod, 'POST');
  assert.equal(doc.crawlers.length, 1);
});
