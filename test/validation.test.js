import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExpenseInput, validateOnboardingInput, validateGoalInput, validateIncomeSource } from '../src/engine/validation.js';

test('validateExpenseInput requires amount, category, subcategory, date', () => {
  const result = validateExpenseInput({ amount: 0, categoryId: '', subcategory: '', date: '' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.amount);
  assert.ok(result.errors.categoryId);
  assert.ok(result.errors.subcategory);
  assert.ok(result.errors.date);
});

test('validateExpenseInput passes with valid input', () => {
  const result = validateExpenseInput({ amount: 500, categoryId: 'wants', subcategory: 'Shopping', date: '2026-01-01' });
  assert.equal(result.valid, true);
});

test('validateOnboardingInput requires a currency and at least one real income source', () => {
  assert.equal(validateOnboardingInput({ currency: '', incomeSources: [] }).valid, false);
  assert.equal(validateOnboardingInput({ currency: 'USD', incomeSources: [] }).valid, false);
  assert.equal(validateOnboardingInput({ currency: 'USD', incomeSources: [{ amount: 0 }] }).valid, false);
  assert.equal(validateOnboardingInput({ currency: 'USD', incomeSources: [{ amount: 2500 }] }).valid, true);
});

test('validateIncomeSource checks amount and frequency-specific fields', () => {
  assert.equal(validateIncomeSource({ amount: 0, frequency: 'monthly' }).valid, false);
  assert.equal(validateIncomeSource({ amount: 500, frequency: 'custom', everyMonths: 0 }).valid, false);
  assert.equal(validateIncomeSource({ amount: 500, frequency: 'custom', everyMonths: 3 }).valid, true);
  assert.equal(validateIncomeSource({ amount: 500, frequency: 'one-time', date: '' }).valid, false);
  assert.equal(validateIncomeSource({ amount: 500, frequency: 'one-time', date: '2026-03-01' }).valid, true);
});

test('validateGoalInput requires title and positive target', () => {
  const result = validateGoalInput({ title: '', targetAmount: 0 });
  assert.equal(result.valid, false);
  const ok = validateGoalInput({ title: 'Buy Laptop', targetAmount: 150000 });
  assert.equal(ok.valid, true);
});
