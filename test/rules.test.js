import test from 'node:test';
import assert from 'node:assert/strict';
import { getRule, resolveGroups, validateGroupPercentages, listRules } from '../src/engine/rules.js';

test('lists all builtin rules including MVP and post-MVP ones', () => {
  const ids = listRules().map((r) => r.id);
  assert.deepEqual(ids, ['50-30-20', '70-20-10', '80-20', 'pay-yourself-first', 'custom']);
});

test('50/30/20 groups sum to 100%', () => {
  const rule = getRule('50-30-20');
  const groups = resolveGroups(rule, null);
  assert.equal(validateGroupPercentages(groups), true);
  assert.deepEqual(groups.map((g) => g.percent), [50, 30, 20]);
});

test('70/20/10 groups map expenses to both needs and wants', () => {
  const rule = getRule('70-20-10');
  const groups = resolveGroups(rule, null);
  const expenses = groups.find((g) => g.id === 'expenses');
  assert.deepEqual(expenses.kind, ['needs', 'wants']);
  assert.equal(expenses.percent, 70);
});

test('pay-yourself-first percent mode derives spending from remainder', () => {
  const rule = getRule('pay-yourself-first');
  const groups = resolveGroups(rule, { savingsMode: 'percent', savingsPercent: 35 });
  const savings = groups.find((g) => g.id === 'savings');
  const spending = groups.find((g) => g.id === 'spending');
  assert.equal(savings.percent, 35);
  assert.equal(spending.percent, 65);
});

test('pay-yourself-first fixed mode flags a fixedAmount instead of percent', () => {
  const rule = getRule('pay-yourself-first');
  const groups = resolveGroups(rule, { savingsMode: 'fixed', savingsFixedAmount: 15000 });
  const savings = groups.find((g) => g.id === 'savings');
  assert.equal(savings.fixedAmount, 15000);
  assert.equal(savings.percent, null);
});

test('custom rule uses user-defined groups', () => {
  const rule = getRule('custom');
  const customGroups = [
    { id: 'a', label: 'A', kind: ['needs'], percent: 40 },
    { id: 'b', label: 'B', kind: ['wants'], percent: 40 },
    { id: 'c', label: 'C', kind: ['savings'], percent: 20 },
  ];
  const groups = resolveGroups(rule, { customGroups });
  assert.equal(validateGroupPercentages(groups), true);
  assert.deepEqual(groups, customGroups);
});

test('validateGroupPercentages rejects mismatched totals', () => {
  assert.equal(validateGroupPercentages([{ percent: 50 }, { percent: 40 }]), false);
});
