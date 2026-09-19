import test from 'node:test';
import assert from 'node:assert/strict';
import { createPolicy, globToRegExp } from '../src/policy.js';
import { testCatalog } from './helpers.js';

const catalog = testCatalog();
const dnsbot = catalog.byId.get('dnsbot');
const cidrbot = catalog.byId.get('cidrbot');
const verified = { status: 'verified', reason: 'ok' };
const unknown = { status: 'unknown', reason: 'reverse_dns_failed:ETIMEOUT' };
const spoofed = { status: 'spoofed', reason: 'no_ptr_record' };

test('the default action applies to crawlers with no rule', () => {
  const policy = createPolicy({ defaultAction: 'log' }, { catalog });
  assert.equal(policy.resolve({ crawler: dnsbot, verification: verified, pathname: '/' }).action, 'log');
});

test('a per-bot rule overrides the default', () => {
  const policy = createPolicy({ defaultAction: 'allow', rules: { dnsbot: 'block' } }, { catalog });
  assert.equal(policy.resolve({ crawler: dnsbot, verification: verified, pathname: '/' }).action, 'block');
  assert.equal(policy.resolve({ crawler: cidrbot, verification: verified, pathname: '/' }).action, 'allow');
});

test('per-bot path rules beat the bot-wide action', () => {
  const policy = createPolicy({
    rules: { dnsbot: { action: 'allow', paths: [{ match: '/premium/', action: 'license' }] } },
  }, { catalog });
  assert.equal(policy.resolve({ crawler: dnsbot, verification: verified, pathname: '/premium/report' }).action, 'license');
  assert.equal(policy.resolve({ crawler: dnsbot, verification: verified, pathname: '/blog/post' }).action, 'allow');
});

test('global path rules apply to every crawler without a more specific rule', () => {
  const policy = createPolicy({
    defaultAction: 'allow',
    pathRules: [{ match: '/internal/', action: 'block' }],
  }, { catalog });
  assert.equal(policy.resolve({ crawler: cidrbot, verification: verified, pathname: '/internal/x' }).action, 'block');
  assert.equal(policy.resolve({ crawler: cidrbot, verification: verified, pathname: '/x' }).action, 'allow');
});

test('a spoofed identity is blocked regardless of the bot rule', () => {
  const policy = createPolicy({ defaultAction: 'allow', rules: { dnsbot: 'allow' } }, { catalog });
  const decision = policy.resolve({ crawler: dnsbot, verification: spoofed, pathname: '/' });
  assert.equal(decision.action, 'block');
  assert.equal(decision.source, 'onSpoofed');
  assert.match(decision.reason, /verification refuted it/);
});

test('onSpoofed can be relaxed for a monitor-first rollout', () => {
  const policy = createPolicy({ onSpoofed: 'log' }, { catalog });
  assert.equal(policy.resolve({ crawler: dnsbot, verification: spoofed, pathname: '/' }).action, 'log');
});

test('an unverifiable identity inherits the bot action by default', () => {
  const policy = createPolicy({ rules: { dnsbot: 'block' } }, { catalog });
  assert.equal(policy.resolve({ crawler: dnsbot, verification: unknown, pathname: '/' }).action, 'block');
});

test('requireVerified withholds a permissive rule until identity is proven', () => {
  const policy = createPolicy({
    defaultAction: 'block',
    rules: { dnsbot: { action: 'allow', requireVerified: true } },
  }, { catalog });
  assert.equal(policy.resolve({ crawler: dnsbot, verification: verified, pathname: '/' }).action, 'allow');
  const held = policy.resolve({ crawler: dnsbot, verification: unknown, pathname: '/' });
  assert.equal(held.action, 'block');
  assert.equal(held.source, 'rules.dnsbot.requireVerified');
});

test('requireVerified can fall back to the licensing page instead of a hard block', () => {
  const policy = createPolicy({
    rules: { dnsbot: { action: 'allow', requireVerified: true, unverifiedAction: 'license' } },
  }, { catalog });
  assert.equal(policy.resolve({ crawler: dnsbot, verification: unknown, pathname: '/' }).action, 'license');
});

test('onUnknown overrides the inherited action when set explicitly', () => {
  const policy = createPolicy({ defaultAction: 'allow', onUnknown: 'log' }, { catalog });
  assert.equal(policy.resolve({ crawler: dnsbot, verification: unknown, pathname: '/' }).action, 'log');
});

test('a catalog defaultAction is used when the owner has no opinion', () => {
  const withDefault = testCatalog({
    crawlers: [{ id: 'searchy', robotsToken: 'Searchy', userAgentPatterns: ['Searchy'], defaultAction: 'allow' }],
  });
  const policy = createPolicy({ defaultAction: 'block' }, { catalog: withDefault });
  const decision = policy.resolve({ crawler: withDefault.byId.get('searchy'), verification: verified, pathname: '/' });
  assert.equal(decision.action, 'allow');
  assert.equal(decision.source, 'catalog.defaultAction');
});

test('rules naming an unknown crawler are rejected at construction', () => {
  assert.throws(() => createPolicy({ rules: { nosuchbot: 'block' } }, { catalog }), /no crawler with id/);
});

test('invalid actions are rejected at construction', () => {
  assert.throws(() => createPolicy({ defaultAction: 'maybe' }, { catalog }), /expected one of/);
  assert.throws(() => createPolicy({ rules: { dnsbot: 'nope' } }, { catalog }), /expected one of/);
});

test('glob semantics', () => {
  assert.ok(globToRegExp('/admin').test('/admin'));
  assert.ok(!globToRegExp('/admin').test('/admin/users'));
  assert.ok(globToRegExp('/admin/').test('/admin/users/1'));
  assert.ok(globToRegExp('/blog/*').test('/blog/post'));
  assert.ok(!globToRegExp('/blog/*').test('/blog/2024/post'));
  assert.ok(globToRegExp('/blog/**').test('/blog/2024/post'));
  assert.ok(globToRegExp('*.pdf').test('/files/report.pdf') === false, 'segment wildcards do not cross slashes');
  assert.ok(globToRegExp('**.pdf').test('/files/report.pdf'));
});

test('the policy round-trips through JSON', () => {
  const input = {
    defaultAction: 'log',
    onSpoofed: 'block',
    onUnknown: 'inherit',
    onUnverifiable: 'inherit',
    pathRules: [{ match: '/internal/', action: 'block' }],
    rules: { dnsbot: { action: 'allow', requireVerified: true, paths: [{ match: '/premium/', action: 'license' }] } },
  };
  const json = createPolicy(input, { catalog }).toJSON();
  assert.deepEqual(json, input);
  assert.deepEqual(createPolicy(json, { catalog }).toJSON(), input);
});
