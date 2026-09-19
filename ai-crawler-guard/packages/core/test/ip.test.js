import test from 'node:test';
import assert from 'node:assert/strict';
import { cidrContains, normalizeIp, parseIp, resolveClientIp, sameIp } from '../src/ip.js';

test('parses and normalises IPv4', () => {
  assert.equal(normalizeIp('203.0.113.5'), '203.0.113.5');
  assert.equal(normalizeIp(' 203.0.113.5 '), '203.0.113.5');
  assert.equal(normalizeIp('203.0.113.256'), null);
  assert.equal(normalizeIp('203.0.113'), null);
  assert.equal(normalizeIp('not an ip'), null);
});

test('parses and normalises IPv6, including compression and zone ids', () => {
  assert.equal(normalizeIp('2001:0db8:0000:0000:0000:0000:0000:0001'), '2001:db8::1');
  assert.equal(normalizeIp('[2001:db8::1]'), '2001:db8::1');
  assert.equal(normalizeIp('fe80::1%eth0'), 'fe80::1');
  assert.equal(normalizeIp('::1'), '::1');
  assert.equal(normalizeIp('2001:db8:::1'), null);
});

test('unwraps IPv4-mapped IPv6 so both forms compare equal', () => {
  assert.equal(normalizeIp('::ffff:203.0.113.5'), '203.0.113.5');
  assert.ok(sameIp('::ffff:203.0.113.5', '203.0.113.5'));
  assert.ok(cidrContains('203.0.113.0/24', '::ffff:203.0.113.5'));
});

test('CIDR containment respects prefix boundaries', () => {
  assert.ok(cidrContains('203.0.113.0/24', '203.0.113.255'));
  assert.ok(!cidrContains('203.0.113.0/24', '203.0.114.0'));
  assert.ok(cidrContains('203.0.113.64/26', '203.0.113.127'));
  assert.ok(!cidrContains('203.0.113.64/26', '203.0.113.128'));
  assert.ok(cidrContains('0.0.0.0/0', '1.2.3.4'));
  assert.ok(cidrContains('2001:db8::/32', '2001:db8:ffff::1'));
  assert.ok(!cidrContains('2001:db8::/32', '2001:db9::1'));
  assert.ok(!cidrContains('203.0.113.0/24', '2001:db8::1'), 'families must not cross');
  assert.ok(!cidrContains('203.0.113.0/33', '203.0.113.1'), 'invalid prefix is not a match');
});

test('client IP ignores forwarding headers unless a proxy is trusted', () => {
  const headers = { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' };
  assert.deepEqual(
    resolveClientIp({ headers, socketIp: '10.0.0.2' }),
    { ip: '10.0.0.2', source: 'socket' },
  );
});

test('trustProxy as a hop count picks the right entry', () => {
  const headers = { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' };
  assert.equal(resolveClientIp({ headers, socketIp: '10.0.0.2', trustProxy: 2 }).ip, '1.2.3.4');
  assert.equal(resolveClientIp({ headers, socketIp: '10.0.0.2', trustProxy: 1 }).ip, '10.0.0.1');
});

test('trustProxy as CIDRs peels off our own proxies only', () => {
  const headers = { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' };
  assert.equal(
    resolveClientIp({ headers, socketIp: '10.0.0.2', trustProxy: ['10.0.0.0/8'] }).ip,
    '1.2.3.4',
  );
  // A spoofed chain that is not ours stops at the first untrusted address.
  assert.equal(
    resolveClientIp({
      headers: { 'x-forwarded-for': '1.2.3.4, 66.66.66.66' },
      socketIp: '10.0.0.2',
      trustProxy: ['10.0.0.0/8'],
    }).ip,
    '66.66.66.66',
  );
});

test('malformed forwarding entries are discarded, not trusted', () => {
  const headers = { 'x-forwarded-for': 'garbage, 1.2.3.4' };
  assert.equal(resolveClientIp({ headers, socketIp: '10.0.0.2', trustProxy: 1 }).ip, '1.2.3.4');
});

test('unparseable addresses are rejected outright', () => {
  assert.equal(parseIp(''), null);
  assert.equal(parseIp(null), null);
  assert.equal(parseIp('999.1.1.1'), null);
});
