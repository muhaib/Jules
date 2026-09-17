import test from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress, totalMonthlyGoalContributions } from '../src/engine/goals.js';

test('worked example: Buy Laptop goal', () => {
  const goal = { targetAmount: 150000, currentAmount: 50000, monthlyContribution: 10000 };
  const progress = goalProgress(goal);
  assert.equal(progress.remaining, 100000);
  assert.equal(progress.monthsToComplete, 10);
  assert.equal(progress.isComplete, false);
});

test('progress percent is capped at 100 and marks completion', () => {
  const goal = { targetAmount: 100000, currentAmount: 120000, monthlyContribution: 5000 };
  const progress = goalProgress(goal);
  assert.equal(progress.progressPercent, 100);
  assert.equal(progress.isComplete, true);
});

test('no monthly contribution yields no completion estimate', () => {
  const goal = { targetAmount: 100000, currentAmount: 10000, monthlyContribution: 0 };
  const progress = goalProgress(goal);
  assert.equal(progress.monthsToComplete, null);
  assert.equal(progress.estimatedCompletionDate, null);
});

test('totalMonthlyGoalContributions sums across goals', () => {
  const goals = [{ monthlyContribution: 10000 }, { monthlyContribution: 5000 }, {}];
  assert.equal(totalMonthlyGoalContributions(goals), 15000);
});
