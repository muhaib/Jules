import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CATEGORIES, resolveKind, mergeCategories, subcategoryNames, KINDS } from '../src/engine/categories.js';

test('default categories are generic personal-finance groupings', () => {
  assert.deepEqual(DEFAULT_CATEGORIES.map((c) => c.label), ['Needs', 'Wants', 'Financial']);
  assert.ok(subcategoryNames(DEFAULT_CATEGORIES[0]).includes('Housing'));
  assert.ok(subcategoryNames(DEFAULT_CATEGORIES[0]).includes('Utilities'));
  assert.ok(subcategoryNames(DEFAULT_CATEGORIES[1]).includes('Dining out'));
  assert.ok(subcategoryNames(DEFAULT_CATEGORIES[2]).includes('Emergency Fund'));
});

test('no location-, employer- or currency-specific labels remain', () => {
  const allLabels = DEFAULT_CATEGORIES.flatMap((c) => [c.label, ...subcategoryNames(c)]).join(' ').toLowerCase();
  for (const term of ['rent', 'salary', 'branch', 'employee', 'company', 'rs.', 'pkr']) {
    assert.equal(allLabels.includes(term), false, `expected no "${term}" in default categories`);
  }
});

test('subcategories inherit their category kind', () => {
  assert.equal(resolveKind(DEFAULT_CATEGORIES, 'needs', 'Groceries'), KINDS.NEEDS);
  assert.equal(resolveKind(DEFAULT_CATEGORIES, 'wants', 'Entertainment'), KINDS.WANTS);
  assert.equal(resolveKind(DEFAULT_CATEGORIES, 'financial', 'Retirement'), KINDS.SAVINGS);
});

test('Debt Payment sits under Financial for the user but counts as debt for the rules', () => {
  assert.equal(resolveKind(DEFAULT_CATEGORIES, 'financial', 'Debt Payment'), KINDS.DEBT);
});

test('unknown categories resolve to null rather than guessing', () => {
  assert.equal(resolveKind(DEFAULT_CATEGORIES, 'nope', 'Whatever'), null);
});

test('custom categories merge in and can carry any kind', () => {
  const merged = mergeCategories(DEFAULT_CATEGORIES, [
    { id: 'pets', kind: KINDS.WANTS, label: 'Pets', subcategories: ['Food', 'Vet'] },
  ]);
  assert.equal(merged.length, DEFAULT_CATEGORIES.length + 1);
  assert.equal(resolveKind(merged, 'pets', 'Vet'), KINDS.WANTS);
});

test('custom subcategories extend a built-in category without duplicating', () => {
  const merged = mergeCategories(DEFAULT_CATEGORIES, [
    { id: 'needs', kind: KINDS.NEEDS, label: 'Needs', subcategories: ['Childcare', 'Groceries'] },
  ]);
  const names = subcategoryNames(merged.find((c) => c.id === 'needs'));
  assert.ok(names.includes('Childcare'));
  assert.equal(names.filter((n) => n === 'Groceries').length, 1);
});

test('merging does not mutate the frozen defaults', () => {
  mergeCategories(DEFAULT_CATEGORIES, [{ id: 'needs', kind: KINDS.NEEDS, label: 'Needs', subcategories: ['Childcare'] }]);
  assert.equal(subcategoryNames(DEFAULT_CATEGORIES[0]).includes('Childcare'), false);
});
