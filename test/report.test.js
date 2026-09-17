import test from 'node:test';
import assert from 'node:assert/strict';
import { getRule } from '../src/engine/rules.js';
import { computeBudgetSnapshot } from '../src/engine/budget.js';
import { categoryTotalsList } from '../src/engine/insights.js';
import { generateMonthlyReport } from '../src/engine/report.js';

const rule = getRule('50-30-20');

test('September worked example report', () => {
  const expenses = [
    { amount: 32500, categoryKind: 'needs', subcategory: 'Housing' },
    { amount: 25200, categoryKind: 'wants', subcategory: 'Dining out' },
    { amount: 23800, categoryKind: 'savings', subcategory: 'Savings' },
  ];
  const snapshot = computeBudgetSnapshot({ rule, income: 80000, config: null, expenses });
  snapshot.categoryTotals = categoryTotalsList(expenses);

  const report = generateMonthlyReport({ monthLabel: 'September', snapshot, previousSnapshot: null, emergencyFundContribution: 0, goalContributions: 0 });

  assert.equal(report.totalIncome, 80000);
  assert.equal(report.totalExpenses, 81500);
  assert.equal(report.totalSavings, 23800);
  assert.equal(report.savingsRate, 29.75);
  const wants = report.groups.find((g) => g.id === 'wants');
  assert.equal(wants.status, 'exceeded');
  assert.equal(wants.exceededBy, 1200);
  // Savings can also cross 100% of its benchmark allocation (saving more
  // than the rule suggests isn't a problem, but it is still "over" the
  // benchmark split) — both wants and savings show as exceeded here.
  assert.equal(report.exceededGroups.length, 2);
  assert.ok(report.exceededGroups.some((g) => g.id === 'wants'));
  assert.equal(report.largestCategories[0].category, 'Housing');
});

test('month-over-month comparison diffs income, expenses and savings', () => {
  const current = computeBudgetSnapshot({ rule, income: 80000, config: null, expenses: [{ amount: 20000, categoryKind: 'savings' }] });
  const previous = computeBudgetSnapshot({ rule, income: 75000, config: null, expenses: [{ amount: 15000, categoryKind: 'savings' }] });
  current.categoryTotals = [];
  const report = generateMonthlyReport({ monthLabel: 'October', snapshot: current, previousSnapshot: previous, emergencyFundContribution: 0, goalContributions: 0 });
  assert.equal(report.comparison.incomeDiff, 5000);
  assert.equal(report.comparison.savingsDiff, 5000);
});
