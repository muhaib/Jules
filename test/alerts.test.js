import test from 'node:test';
import assert from 'node:assert/strict';
import { getRule } from '../src/engine/rules.js';
import { computeBudgetSnapshot, previewExpenseImpact } from '../src/engine/budget.js';
import { buildAlerts, buildPreSaveWarning } from '../src/engine/alerts.js';

const rule = getRule('50-30-20');

function snapshotWithWantsSpend(amount) {
  return computeBudgetSnapshot({ rule, income: 80000, config: null, expenses: [{ amount, categoryKind: 'wants' }] });
}

test('75% used triggers a mild info alert', () => {
  const alerts = buildAlerts(snapshotWithWantsSpend(18000), 'USD'); // 18000/24000 = 75%
  const wantsAlert = alerts.find((a) => a.groupId === 'wants');
  assert.equal(wantsAlert.level, 'info');
  assert.match(wantsAlert.message, /75% of your Wants budget has been used/);
});

test('80% used triggers a warning alert', () => {
  const alerts = buildAlerts(snapshotWithWantsSpend(19200), 'USD'); // 80%
  const wantsAlert = alerts.find((a) => a.groupId === 'wants');
  assert.equal(wantsAlert.level, 'warning');
  assert.match(wantsAlert.message, /80% of your Wants budget/);
});

test('90% used warns about remaining amount', () => {
  const alerts = buildAlerts(snapshotWithWantsSpend(21600), 'USD'); // 90%
  const wantsAlert = alerts.find((a) => a.groupId === 'wants');
  assert.match(wantsAlert.message, /almost finished/);
  assert.match(wantsAlert.message, /\$2,400/);
});

test('100%+ used triggers a danger "exceeded" alert', () => {
  const alerts = buildAlerts(snapshotWithWantsSpend(24800), 'USD');
  const wantsAlert = alerts.find((a) => a.groupId === 'wants');
  assert.equal(wantsAlert.level, 'danger');
  assert.match(wantsAlert.message, /exceeded/);
  assert.match(wantsAlert.detail, /Exceeded by: \$800/);
});

test('only the highest threshold crossed is surfaced per group (no duplicate alerts)', () => {
  const alerts = buildAlerts(snapshotWithWantsSpend(24800), 'USD');
  const wantsAlerts = alerts.filter((a) => a.groupId === 'wants');
  assert.equal(wantsAlerts.length, 1);
});

test('pre-save warning matches the spec wording for a purchase that will exceed budget', () => {
  const snapshot = computeBudgetSnapshot({ rule, income: 80000, config: null, expenses: [{ amount: 20800, categoryKind: 'wants' }] });
  const preview = previewExpenseImpact(snapshot, { amount: 5000, categoryKind: 'wants' });
  const warning = buildPreSaveWarning(preview, 'Wants', 'USD');
  assert.equal(warning.message, 'This expense will exceed your Wants budget by $1,800.');
});

test('no pre-save warning when the expense stays within budget', () => {
  const snapshot = computeBudgetSnapshot({ rule, income: 80000, config: null, expenses: [] });
  const preview = previewExpenseImpact(snapshot, { amount: 5000, categoryKind: 'wants' });
  assert.equal(buildPreSaveWarning(preview, 'Wants', 'USD'), null);
});
