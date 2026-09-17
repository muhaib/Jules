import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTarget, calculateProgress, estimateMonthsToTarget } from '../src/engine/emergencyFund.js';

test('worked example: Rs. 40,000 essential expenses -> 3 and 6 month targets', () => {
  assert.equal(calculateTarget(40000, 3), 120000);
  assert.equal(calculateTarget(40000, 6), 240000);
});

test('progress percent and remaining match worked example', () => {
  const progress = calculateProgress(23000, 240000);
  assert.equal(progress.progressPercent, 9.58);
  assert.equal(progress.remaining, 217000);
  assert.equal(progress.isComplete, false);
});

test('fund is complete once current meets or exceeds target', () => {
  const progress = calculateProgress(240000, 240000);
  assert.equal(progress.progressPercent, 100);
  assert.equal(progress.isComplete, true);
});

test('estimateMonthsToTarget divides remaining by monthly contribution, rounding up', () => {
  assert.equal(estimateMonthsToTarget(217000, 23000), 10);
  assert.equal(estimateMonthsToTarget(1000, 0), null);
});
