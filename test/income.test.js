import test from 'node:test';
import assert from 'node:assert/strict';
import {
  monthlyEquivalent, recurringMonthlyIncome, oneTimeIncomeForMonth,
  monthlyIncomeFor, incomeBreakdown, makeIncomeSource, INCOME_TYPES,
} from '../src/engine/income.js';

test('supports every income type, not just employment', () => {
  assert.deepEqual(INCOME_TYPES, ['Salary', 'Freelance', 'Business', 'Part-time', 'Other']);
});

test('monthly income passes through unchanged', () => {
  assert.equal(monthlyEquivalent({ amount: 2500, frequency: 'monthly' }), 2500);
});

test('weekly and biweekly income normalize using average month length', () => {
  // 52 weeks / 12 months = 4.333… weeks per month
  assert.equal(monthlyEquivalent({ amount: 300, frequency: 'weekly' }), 1300);
  assert.equal(monthlyEquivalent({ amount: 600, frequency: 'biweekly' }), 1300);
});

test('yearly and custom-interval income spread across months', () => {
  assert.equal(monthlyEquivalent({ amount: 60000, frequency: 'yearly' }), 5000);
  assert.equal(monthlyEquivalent({ amount: 3000, frequency: 'custom', everyMonths: 3 }), 1000);
});

test('one-time income contributes nothing to the recurring basis', () => {
  assert.equal(monthlyEquivalent({ amount: 5000, frequency: 'one-time', date: '2026-03-10' }), 0);
});

test('inactive sources are excluded', () => {
  assert.equal(monthlyEquivalent({ amount: 2500, frequency: 'monthly', active: false }), 0);
});

test('negative or junk amounts are treated as zero rather than reducing income', () => {
  assert.equal(monthlyEquivalent({ amount: -500, frequency: 'monthly' }), 0);
  assert.equal(monthlyEquivalent({ amount: 'abc', frequency: 'monthly' }), 0);
});

test('multiple sources add up to a single monthly basis', () => {
  const sources = [
    { label: 'Salary', type: 'Salary', amount: 2500, frequency: 'monthly' },
    { label: 'Freelance', type: 'Freelance', amount: 500, frequency: 'monthly' },
  ];
  assert.equal(recurringMonthlyIncome(sources), 3000);
});

test('one-time income counts only in the month it arrives', () => {
  const sources = [
    { amount: 2000, frequency: 'monthly' },
    { amount: 750, frequency: 'one-time', date: '2026-03-14' },
  ];
  assert.equal(oneTimeIncomeForMonth(sources, '2026-03'), 750);
  assert.equal(oneTimeIncomeForMonth(sources, '2026-04'), 0);
  assert.equal(monthlyIncomeFor(sources, '2026-03'), 2750);
  assert.equal(monthlyIncomeFor(sources, '2026-04'), 2000);
});

test('irregular income across mixed frequencies totals correctly', () => {
  const sources = [
    { amount: 1200, frequency: 'monthly' },      // 1200
    { amount: 200, frequency: 'weekly' },         // 866.67
    { amount: 12000, frequency: 'yearly' },       // 1000
    { amount: 900, frequency: 'custom', everyMonths: 3 }, // 300
  ];
  assert.equal(recurringMonthlyIncome(sources), 3366.67);
});

test('breakdown marks whether each source counts toward the given month', () => {
  const sources = [
    { id: 'a', amount: 2000, frequency: 'monthly' },
    { id: 'b', amount: 800, frequency: 'one-time', date: '2026-03-02' },
  ];
  const march = incomeBreakdown(sources, '2026-03');
  assert.equal(march.find((s) => s.id === 'b').countsThisMonth, true);
  assert.equal(march.find((s) => s.id === 'b').monthlyAmount, 800);
  const april = incomeBreakdown(sources, '2026-04');
  assert.equal(april.find((s) => s.id === 'b').countsThisMonth, false);
  assert.equal(april.find((s) => s.id === 'b').monthlyAmount, 0);
});

test('makeIncomeSource normalizes frequency-specific fields', () => {
  const oneTime = makeIncomeSource({ type: 'Freelance', amount: 900, frequency: 'one-time', date: '2026-05-01' });
  assert.equal(oneTime.date, '2026-05-01');
  assert.equal(oneTime.everyMonths, null);

  const custom = makeIncomeSource({ type: 'Business', amount: 900, frequency: 'custom', everyMonths: 4 });
  assert.equal(custom.everyMonths, 4);
  assert.equal(custom.date, null);

  const clamped = makeIncomeSource({ type: 'Salary', amount: 100, frequency: 'monthly', paymentDay: 45 });
  assert.equal(clamped.paymentDay, 31);
});

test('empty income is zero, never NaN', () => {
  assert.equal(recurringMonthlyIncome([]), 0);
  assert.equal(recurringMonthlyIncome(undefined), 0);
  assert.equal(monthlyIncomeFor([], '2026-01'), 0);
});
