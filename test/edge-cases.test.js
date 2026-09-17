// Robustness checks for the conditions a publicly released app actually
// meets: no income yet, tiny incomes, very large incomes, spending past
// every limit, and odd or missing data.

import test from 'node:test';
import assert from 'node:assert/strict';
import { getRule } from '../src/engine/rules.js';
import { computeBudgetSnapshot, calculateAllocations, analyzePurchase } from '../src/engine/budget.js';
import { buildAlerts } from '../src/engine/alerts.js';
import { calculateTarget, calculateProgress } from '../src/engine/emergencyFund.js';
import { monthlyIncomeFor } from '../src/engine/income.js';

const rule = getRule('50-30-20');

test('empty state: no income and no expenses produces zeros, not NaN', () => {
  const snapshot = computeBudgetSnapshot({ rule, income: 0, config: null, expenses: [] });
  assert.equal(snapshot.totalIncome, 0);
  assert.equal(snapshot.totalSpent, 0);
  assert.equal(snapshot.remainingIncome, 0);
  assert.equal(snapshot.savingsRate, 0);
  for (const group of snapshot.groups) {
    assert.equal(group.allocated, 0);
    assert.equal(group.percentUsed, 0);
    assert.equal(group.status, 'ok');
    assert.equal(Number.isNaN(group.remaining), false);
  }
  assert.deepEqual(buildAlerts(snapshot, 'USD'), []);
});

test('spending with no income set is flagged rather than dividing by zero', () => {
  const snapshot = computeBudgetSnapshot({ rule, income: 0, config: null, expenses: [{ amount: 50, categoryKind: 'wants' }] });
  const wants = snapshot.groups.find((g) => g.id === 'wants');
  assert.equal(wants.percentUsed, 100);
  assert.equal(wants.status, 'exceeded');
  assert.equal(snapshot.remainingIncome, -50);
});

test('a very small income still splits correctly', () => {
  const allocations = calculateAllocations(rule, 10, null);
  assert.deepEqual(allocations.map((g) => g.allocated), [5, 3, 2]);
});

test('a very large income stays exact and does not overflow', () => {
  const allocations = calculateAllocations(rule, 10_000_000_000, null);
  assert.deepEqual(allocations.map((g) => g.allocated), [5_000_000_000, 3_000_000_000, 2_000_000_000]);
  assert.equal(allocations.every((g) => Number.isFinite(g.allocated)), true);
});

test('fractional income rounds to two decimals without drifting', () => {
  const allocations = calculateAllocations(rule, 3333.33, null);
  assert.deepEqual(allocations.map((g) => g.allocated), [1666.67, 1000, 666.67]);
});

test('budget overflow maths stay correct well past 100%', () => {
  const snapshot = computeBudgetSnapshot({ rule, income: 3000, config: null, expenses: [{ amount: 3600, categoryKind: 'wants' }] });
  const wants = snapshot.groups.find((g) => g.id === 'wants'); // budget 900
  assert.equal(wants.allocated, 900);
  assert.equal(wants.spent, 3600);
  assert.equal(wants.percentUsed, 400);
  assert.equal(wants.remaining, -2700);
  assert.equal(wants.exceededBy, 2700);
  assert.equal(wants.status, 'exceeded');
});

test('every group can be over budget at once without corrupting totals', () => {
  const snapshot = computeBudgetSnapshot({
    rule, income: 3000, config: null,
    expenses: [
      { amount: 2000, categoryKind: 'needs' },
      { amount: 1500, categoryKind: 'wants' },
      { amount: 1000, categoryKind: 'savings' },
    ],
  });
  assert.equal(snapshot.totalSpent, 4500);
  assert.equal(snapshot.remainingIncome, -1500);
  assert.equal(snapshot.groups.every((g) => g.status === 'exceeded'), true);
  assert.equal(buildAlerts(snapshot, 'USD').length, 3);
});

test('income is recalculated dynamically when sources change', () => {
  const sources = [{ amount: 2500, frequency: 'monthly' }];
  const before = computeBudgetSnapshot({ rule, income: monthlyIncomeFor(sources, '2026-03'), config: null, expenses: [] });
  assert.equal(before.groups.find((g) => g.id === 'needs').allocated, 1250);

  sources.push({ amount: 500, frequency: 'monthly' });
  const after = computeBudgetSnapshot({ rule, income: monthlyIncomeFor(sources, '2026-03'), config: null, expenses: [] });
  assert.equal(after.groups.find((g) => g.id === 'needs').allocated, 1500);
});

test('one-time income lifts only its own month, then the budget returns to normal', () => {
  const sources = [
    { amount: 2000, frequency: 'monthly' },
    { amount: 1000, frequency: 'one-time', date: '2026-03-20' },
  ];
  const march = computeBudgetSnapshot({ rule, income: monthlyIncomeFor(sources, '2026-03'), config: null, expenses: [] });
  const april = computeBudgetSnapshot({ rule, income: monthlyIncomeFor(sources, '2026-04'), config: null, expenses: [] });
  assert.equal(march.totalIncome, 3000);
  assert.equal(april.totalIncome, 2000);
});

test('emergency fund targets scale to any income level and handle zero expenses', () => {
  assert.equal(calculateTarget(2000, 6), 12000);
  assert.equal(calculateProgress(4500, 12000).progressPercent, 37.5);
  assert.equal(calculateTarget(0, 6), 0);

  const noTarget = calculateProgress(0, 0);
  assert.equal(noTarget.progressPercent, 0);
  assert.equal(noTarget.isComplete, false);
  assert.equal(Number.isNaN(noTarget.progressPercent), false);
});

test('affordability analysis reports facts for a purchase that fits', () => {
  const snapshot = computeBudgetSnapshot({ rule, income: 3000, config: null, expenses: [{ amount: 400, categoryKind: 'wants' }] });
  const analysis = analyzePurchase(snapshot, { amount: 300, categoryKind: 'wants' }, { monthlyGoalContributions: 0, emergencyFundRemaining: 0 });
  assert.equal(analysis.budgetRemainingBefore, 500);
  assert.equal(analysis.willExceedBudget, false);
  assert.equal(analysis.budgetRemainingAfter, 200);
  assert.equal(analysis.willExceedIncome, false);
});

test('affordability analysis quantifies a purchase that does not fit', () => {
  const snapshot = computeBudgetSnapshot({ rule, income: 3000, config: null, expenses: [{ amount: 720, categoryKind: 'wants' }] });
  const analysis = analyzePurchase(snapshot, { amount: 300, categoryKind: 'wants' }, {});
  assert.equal(analysis.budgetRemainingBefore, 180);
  assert.equal(analysis.willExceedBudget, true);
  assert.equal(analysis.exceededBy, 120);
});

test('affordability analysis notices when a purchase eats committed goal savings', () => {
  const snapshot = computeBudgetSnapshot({ rule, income: 3000, config: null, expenses: [{ amount: 2600, categoryKind: 'needs' }] });
  const analysis = analyzePurchase(snapshot, { amount: 300, categoryKind: 'wants' }, { monthlyGoalContributions: 250 });
  assert.equal(analysis.incomeRemainingAfter, 100);
  assert.equal(analysis.cutsIntoCommitments, true);
  assert.equal(analysis.uncommittedAfter, -150);
});

test('expenses in a category the active rule has no group for are still counted', () => {
  const snapshot = computeBudgetSnapshot({ rule, income: 3000, config: null, expenses: [{ amount: 200, categoryKind: 'debt' }] });
  assert.equal(snapshot.unassignedSpent, 200);
  assert.equal(snapshot.totalSpent, 200);
  assert.equal(snapshot.remainingIncome, 2800);
});

test('malformed expense amounts do not corrupt a budget', () => {
  const snapshot = computeBudgetSnapshot({
    rule, income: 3000, config: null,
    expenses: [{ amount: 'abc', categoryKind: 'wants' }, { amount: null, categoryKind: 'wants' }, { amount: 100, categoryKind: 'wants' }],
  });
  assert.equal(snapshot.groups.find((g) => g.id === 'wants').spent, 100);
  assert.equal(snapshot.totalSpent, 100);
});
