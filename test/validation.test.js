import test from 'node:test';
import assert from 'node:assert/strict';
import { validateExpenseInput, validateOnboardingInput, validateGoalInput } from '../src/engine/validation.js';

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

test('validateOnboardingInput requires currency and a positive salary', () => {
  const result = validateOnboardingInput({ currency: '', monthlySalary: -5 });
  assert.equal(result.valid, false);
});

test('validateGoalInput requires title and positive target', () => {
  const result = validateGoalInput({ title: '', targetAmount: 0 });
  assert.equal(result.valid, false);
  const ok = validateGoalInput({ title: 'Buy Laptop', targetAmount: 150000 });
  assert.equal(ok.valid, true);
});
