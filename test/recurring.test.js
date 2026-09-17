import test from 'node:test';
import assert from 'node:assert/strict';
import { materializeForMonth, upcomingReminders, monthKey } from '../src/engine/recurring.js';

test('monthKey formats year-month with zero-padded month', () => {
  assert.equal(monthKey(new Date(2026, 0, 15)), '2026-01');
  assert.equal(monthKey(new Date(2026, 10, 5)), '2026-11');
});

test('materializeForMonth generates one expense per active recurring item', () => {
  const items = [
    { id: 'r1', name: 'Rent', amount: 25000, categoryId: 'needs', categoryKind: 'needs', subcategory: 'Rent', dayOfMonth: 1, active: true, generatedMonths: [] },
    { id: 'r2', name: 'Netflix', amount: 1500, categoryId: 'wants', categoryKind: 'wants', subcategory: 'Subscriptions', dayOfMonth: 5, active: true, generatedMonths: ['2026-01'] },
    { id: 'r3', name: 'Paused gym', amount: 3000, categoryId: 'wants', categoryKind: 'wants', subcategory: 'Hobbies', dayOfMonth: 10, active: false, generatedMonths: [] },
  ];
  const generated = materializeForMonth(items, '2026-01');
  assert.equal(generated.length, 1);
  assert.equal(generated[0].recurringId, 'r1');
  assert.equal(generated[0].date, '2026-01-01');
  assert.equal(generated[0].isRecurring, true);
});

test('materializeForMonth clamps dayOfMonth to the month length', () => {
  const items = [{ id: 'r1', name: 'Loan', amount: 5000, categoryId: 'needs', categoryKind: 'needs', dayOfMonth: 31, active: true, generatedMonths: [] }];
  const generated = materializeForMonth(items, '2026-02'); // Feb 2026 has 28 days
  assert.equal(generated[0].date, '2026-02-28');
});

test('upcomingReminders finds items due within the window, rolling to next month if already past', () => {
  const today = new Date(2026, 0, 29); // Jan 29, 2026
  const items = [
    { id: 'r1', name: 'Electricity', amount: 8000, dayOfMonth: 30, active: true },
    { id: 'r2', name: 'Rent', amount: 25000, dayOfMonth: 1, active: true },
    { id: 'r3', name: 'Far off', amount: 1000, dayOfMonth: 20, active: true },
  ];
  const reminders = upcomingReminders(items, today, 3);
  const ids = reminders.map((r) => r.id);
  assert.ok(ids.includes('r1')); // due Jan 30, 1 day away
  assert.ok(ids.includes('r2')); // rolled to Feb 1, 3 days away
  assert.ok(!ids.includes('r3'));
});
