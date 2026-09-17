import test from 'node:test';
import assert from 'node:assert/strict';
import { getRule } from '../src/engine/rules.js';
import { computeBudgetSnapshot } from '../src/engine/budget.js';
import { buildInsights, categoryTotalsList } from '../src/engine/insights.js';

const rule = getRule('50-30-20');

test('categoryTotalsList sums amounts per subcategory', () => {
  const expenses = [
    { subcategory: 'Restaurants', amount: 1000 },
    { subcategory: 'Restaurants', amount: 500 },
    { subcategory: 'Shopping', amount: 2000 },
  ];
  const totals = categoryTotalsList(expenses);
  const restaurants = totals.find((t) => t.category === 'Restaurants');
  assert.equal(restaurants.amount, 1500);
});

test('flags a significant category spend increase month over month', () => {
  const currentExpenses = [{ subcategory: 'Restaurants', amount: 9000, categoryKind: 'wants' }];
  const previousExpenses = [{ subcategory: 'Restaurants', amount: 4500, categoryKind: 'wants' }];
  const currentSnapshot = computeBudgetSnapshot({ rule, income: 80000, config: null, expenses: currentExpenses });
  const previousSnapshot = computeBudgetSnapshot({ rule, income: 80000, config: null, expenses: previousExpenses });
  const insights = buildInsights({ currentSnapshot, previousSnapshot, currentExpenses, previousExpenses, emergencyFund: null, currency: 'PKR' });
  assert.ok(insights.some((i) => i.type === 'spending-increase' && /Restaurants/.test(i.message)));
});

test('frames rule deviation as a benchmark, not a verdict', () => {
  const expenses = [{ amount: 25200, categoryKind: 'wants' }];
  const currentSnapshot = computeBudgetSnapshot({ rule, income: 80000, config: null, expenses });
  const insights = buildInsights({ currentSnapshot, previousSnapshot: null, currentExpenses: expenses, previousExpenses: [], emergencyFund: null, currency: 'PKR' });
  const deviation = insights.find((i) => i.type === 'benchmark-deviation');
  assert.match(deviation.message, /According to your selected budgeting rule/);
});

test('reports emergency fund gap to target', () => {
  const insights = buildInsights({
    currentSnapshot: null, previousSnapshot: null, currentExpenses: [], previousExpenses: [],
    emergencyFund: { target: 240000, remaining: 50000, isComplete: false }, currency: 'PKR',
  });
  assert.ok(insights.some((i) => i.type === 'emergency-fund-gap' && /Rs\. 50,000/.test(i.message)));
});
