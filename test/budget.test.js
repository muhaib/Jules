import test from 'node:test';
import assert from 'node:assert/strict';
import { getRule } from '../src/engine/rules.js';
import { calculateAllocations, computeBudgetSnapshot, previewExpenseImpact, statusForPercentUsed, aggregateSnapshots } from '../src/engine/budget.js';

const rule502030 = getRule('50-30-20');

test('50/30/20 splits any income into needs/wants/savings', () => {
  assert.deepEqual(calculateAllocations(rule502030, 3000, null).map((g) => g.allocated), [1500, 900, 600]);
  assert.deepEqual(calculateAllocations(rule502030, 80000, null).map((g) => g.allocated), [40000, 24000, 16000]);
});

test('dashboard example: $3,000 income with spending across all three groups', () => {
  const snapshot = computeBudgetSnapshot({
    rule: rule502030, income: 3000, config: null,
    expenses: [
      { amount: 1450, categoryKind: 'needs' },
      { amount: 620, categoryKind: 'wants' },
      { amount: 500, categoryKind: 'savings' },
    ],
  });
  const [needs, wants, savings] = snapshot.groups;
  assert.equal(needs.percentUsed, 96.67);
  assert.equal(wants.percentUsed, 68.89);
  assert.equal(savings.percentUsed, 83.33);
  assert.equal(snapshot.remainingIncome, 430);
  assert.equal(snapshot.groups.every((g) => g.status !== 'exceeded'), true);
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

test('"can I afford this?" preview quantifies the overshoot', () => {
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

test('additional income is included in totalIncome and reallocated across groups', () => {
  const snapshot = computeBudgetSnapshot({ rule: rule502030, income: 80000, otherIncome: 20000, config: null, expenses: [] });
  assert.equal(snapshot.totalIncome, 100000);
  const needs = snapshot.groups.find((g) => g.id === 'needs');
  assert.equal(needs.allocated, 50000);
});

test('aggregateSnapshots sums budget and actual per group across months', () => {
  // Month 1: income 3000 -> needs budget 1500, spent 1000.
  // Month 2: income 3000 -> needs budget 1500, spent 2000 (over).
  const jan = computeBudgetSnapshot({ rule: rule502030, income: 3000, config: null, expenses: [{ amount: 1000, categoryKind: 'needs' }] });
  const feb = computeBudgetSnapshot({ rule: rule502030, income: 3000, config: null, expenses: [{ amount: 2000, categoryKind: 'needs' }] });
  const combined = aggregateSnapshots([jan, feb], rule502030);

  const needs = combined.groups.find((g) => g.id === 'needs');
  assert.equal(needs.allocated, 3000); // 2 months of 1500 budget
  assert.equal(needs.spent, 3000); // 1000 + 2000 actual spend
  assert.equal(needs.percentUsed, 100);
  assert.equal(needs.status, 'exceeded');
  assert.equal(combined.totalIncome, 6000);
});

test('aggregateSnapshots compares N months of budget to N months of spend, not 1 month to N', () => {
  // A single month's Wants budget is 900. Spend 800/month for 3 months:
  // naive raw-spend comparison against 1 month's budget would look wildly
  // over (2400 vs 900); the correct comparison is 2400 vs 3x900 = 2700.
  const month = computeBudgetSnapshot({ rule: rule502030, income: 3000, config: null, expenses: [{ amount: 800, categoryKind: 'wants' }] });
  const combined = aggregateSnapshots([month, month, month], rule502030);
  const wants = combined.groups.find((g) => g.id === 'wants');
  assert.equal(wants.allocated, 2700);
  assert.equal(wants.spent, 2400);
  assert.equal(wants.status, 'high'); // 2400/2700 = 88.9%, not exceeded
});

test('aggregateSnapshots handles an empty month list', () => {
  const combined = aggregateSnapshots([], rule502030);
  assert.equal(combined.totalIncome, 0);
  assert.deepEqual(combined.groups, []);
});

test('aggregateSnapshots preserves unassigned spend across months', () => {
  const rule8020 = getRule('80-20');
  const month = computeBudgetSnapshot({ rule: rule8020, income: 3000, config: null, expenses: [{ amount: 200, categoryKind: 'debt' }] });
  const combined = aggregateSnapshots([month, month], rule8020);
  assert.equal(combined.unassignedSpent, 400);
  assert.equal(combined.totalSpent, 400);
});
