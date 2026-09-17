import test from 'node:test';
import assert from 'node:assert/strict';
import { getRule } from '../src/engine/rules.js';
import { calculateAllocations, computeBudgetSnapshot, previewExpenseImpact, statusForPercentUsed } from '../src/engine/budget.js';

const rule502030 = getRule('50-30-20');

test('worked example: Rs. 80,000 salary under 50/30/20', () => {
  const allocations = calculateAllocations(rule502030, 80000, null);
  assert.deepEqual(allocations.map((g) => g.allocated), [40000, 24000, 16000]);
});

test('allocations update automatically when income changes', () => {
  const allocations = calculateAllocations(rule502030, 100000, null);
  assert.deepEqual(allocations.map((g) => g.allocated), [50000, 30000, 20000]);
});

test('wants budget at 95% used, then exceeded after another expense', () => {
  const expenses = [{ amount: 22800, categoryKind: 'wants' }];
  let snapshot = computeBudgetSnapshot({ rule: rule502030, income: 80000, config: null, expenses });
  let wants = snapshot.groups.find((g) => g.id === 'wants');
  assert.equal(wants.spent, 22800);
  assert.equal(wants.percentUsed, 95);
  assert.equal(wants.remaining, 1200);
  assert.equal(wants.status, 'high');

  expenses.push({ amount: 2000, categoryKind: 'wants' });
  snapshot = computeBudgetSnapshot({ rule: rule502030, income: 80000, config: null, expenses });
  wants = snapshot.groups.find((g) => g.id === 'wants');
  assert.equal(wants.spent, 24800);
  assert.equal(wants.status, 'exceeded');
  assert.equal(wants.exceededBy, 800);
});

test('dashboard worked example: needs/wants/savings status', () => {
  const expenses = [
    { amount: 32500, categoryKind: 'needs' },
    { amount: 25200, categoryKind: 'wants' },
    { amount: 22300, categoryKind: 'savings' },
  ];
  const snapshot = computeBudgetSnapshot({ rule: rule502030, income: 80000, config: null, expenses });
  const [needs, wants, savings] = snapshot.groups;
  assert.equal(needs.percentUsed, 81.25);
  assert.equal(wants.status, 'exceeded');
  assert.equal(wants.percentUsed, 105);
  assert.equal(savings.percentUsed, 139.38);
});

test('"can I afford this?" preview: Rs. 5,000 shopping against Rs. 3,200 remaining', () => {
  const expenses = [{ amount: 20800, categoryKind: 'wants' }];
  const snapshot = computeBudgetSnapshot({ rule: rule502030, income: 80000, config: null, expenses });
  const preview = previewExpenseImpact(snapshot, { amount: 5000, categoryKind: 'wants' });
  assert.equal(preview.willExceed, true);
  assert.equal(preview.exceededBy, 1800);
});

test('statusForPercentUsed maps thresholds to statuses', () => {
  assert.equal(statusForPercentUsed(50), 'ok');
  assert.equal(statusForPercentUsed(75), 'approaching');
  assert.equal(statusForPercentUsed(80), 'high');
  assert.equal(statusForPercentUsed(100), 'exceeded');
  assert.equal(statusForPercentUsed(120), 'exceeded');
});

test('unassigned spend (no matching group kind) is tracked separately, never dropped', () => {
  const rule8020 = getRule('80-20');
  const expenses = [{ amount: 5000, categoryKind: 'debt' }];
  const snapshot = computeBudgetSnapshot({ rule: rule8020, income: 80000, config: null, expenses });
  assert.equal(snapshot.unassignedSpent, 5000);
  assert.equal(snapshot.totalSpent, 5000);
});

test('otherIncome is included in totalIncome and reallocated across groups', () => {
  const snapshot = computeBudgetSnapshot({ rule: rule502030, income: 80000, otherIncome: 20000, config: null, expenses: [] });
  assert.equal(snapshot.totalIncome, 100000);
  const needs = snapshot.groups.find((g) => g.id === 'needs');
  assert.equal(needs.allocated, 50000);
});
