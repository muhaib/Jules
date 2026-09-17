import test from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress, totalMonthlyGoalContributions, monthsUntil, GOAL_TEMPLATES } from '../src/engine/goals.js';

const TODAY = new Date(2026, 0, 15); // 15 Jan 2026, fixed so tests don't drift

test('goal templates cover common personal goals and a custom option', () => {
  assert.ok(GOAL_TEMPLATES.includes('New phone'));
  assert.ok(GOAL_TEMPLATES.includes('Vacation'));
  assert.ok(GOAL_TEMPLATES.includes('Custom goal'));
});

test('tracks remaining, progress and time to completion from the chosen contribution', () => {
  const goal = { targetAmount: 1500, currentAmount: 500, monthlyContribution: 100 };
  const progress = goalProgress(goal, TODAY);
  assert.equal(progress.remaining, 1000);
  assert.equal(progress.progressPercent, 33.33);
  assert.equal(progress.monthsToComplete, 10);
  assert.equal(progress.isComplete, false);
});

test('derives the contribution required to hit a target date', () => {
  const goal = { targetAmount: 1200, currentAmount: 0, monthlyContribution: 100, targetDate: '2026-07-15' };
  const progress = goalProgress(goal, TODAY); // 6 months out
  assert.equal(progress.monthsRemaining, 6);
  assert.equal(progress.requiredMonthlyContribution, 200);
  assert.equal(progress.onTrack, false); // contributing 100, needs 200
});

test('flags a goal as on track when the contribution meets the target date', () => {
  const goal = { targetAmount: 1200, currentAmount: 0, monthlyContribution: 250, targetDate: '2026-07-15' };
  assert.equal(goalProgress(goal, TODAY).onTrack, true);
});

test('a target date this month or in the past needs the whole remainder', () => {
  const thisMonth = goalProgress({ targetAmount: 800, currentAmount: 300, monthlyContribution: 0, targetDate: '2026-01-28' }, TODAY);
  assert.equal(thisMonth.monthsRemaining, 0);
  assert.equal(thisMonth.requiredMonthlyContribution, 500);

  const past = goalProgress({ targetAmount: 800, currentAmount: 300, monthlyContribution: 0, targetDate: '2025-11-01' }, TODAY);
  assert.equal(past.monthsRemaining, 0);
  assert.equal(past.requiredMonthlyContribution, 500);
});

test('no target date means no required contribution or on-track verdict', () => {
  const progress = goalProgress({ targetAmount: 1000, currentAmount: 0, monthlyContribution: 100 }, TODAY);
  assert.equal(progress.requiredMonthlyContribution, null);
  assert.equal(progress.onTrack, null);
});

test('progress caps at 100 and marks completion', () => {
  const progress = goalProgress({ targetAmount: 1000, currentAmount: 1200, monthlyContribution: 50 }, TODAY);
  assert.equal(progress.progressPercent, 100);
  assert.equal(progress.isComplete, true);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.monthsToComplete, 0);
});

test('no monthly contribution yields no completion estimate', () => {
  const progress = goalProgress({ targetAmount: 1000, currentAmount: 100, monthlyContribution: 0 }, TODAY);
  assert.equal(progress.monthsToComplete, null);
  assert.equal(progress.estimatedCompletionDate, null);
});

test('zero and junk values never produce NaN', () => {
  const progress = goalProgress({ targetAmount: 0, currentAmount: 0, monthlyContribution: 0 }, TODAY);
  assert.equal(progress.progressPercent, 0);
  assert.equal(progress.remaining, 0);
  assert.equal(progress.isComplete, false);

  const junk = goalProgress({ targetAmount: 'abc', currentAmount: null, monthlyContribution: undefined }, TODAY);
  assert.equal(Number.isNaN(junk.progressPercent), false);
  assert.equal(junk.remaining, 0);
});

test('monthsUntil counts whole months and never goes negative', () => {
  assert.equal(monthsUntil('2026-04-15', TODAY), 3);
  assert.equal(monthsUntil('2027-01-15', TODAY), 12);
  assert.equal(monthsUntil('2025-06-15', TODAY), 0);
  assert.equal(monthsUntil(null, TODAY), null);
  assert.equal(monthsUntil('not-a-date', TODAY), null);
});

test('totalMonthlyGoalContributions sums across goals', () => {
  assert.equal(totalMonthlyGoalContributions([{ monthlyContribution: 200 }, { monthlyContribution: 50 }, {}]), 250);
  assert.equal(totalMonthlyGoalContributions([]), 0);
});
