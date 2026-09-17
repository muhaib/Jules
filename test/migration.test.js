// Data written by an earlier version must keep working. v1 stored a single
// salary plus an "other income" figure and Pakistan-flavoured category
// names; v2 stores a list of income sources and generic categories.

import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateState, SCHEMA_VERSION } from '../src/store.js';

function legacyState() {
  return {
    schemaVersion: 1,
    profile: {
      name: 'Previous user', currency: 'PKR', monthlySalary: 80000, otherIncome: 20000,
      salaryPaymentDate: 5, essentialMonthlyExpenses: 40000, onboardingComplete: true,
    },
    expenses: [
      { id: 'e1', amount: 100, categoryId: 'savings', categoryKind: 'savings', subcategory: 'General Savings', date: '2026-01-05' },
      { id: 'e2', amount: 50, categoryId: 'needs', categoryKind: 'needs', subcategory: 'Rent', date: '2026-01-06' },
      { id: 'e3', amount: 20, categoryId: 'debt', categoryKind: 'debt', subcategory: 'Loan Installment', date: '2026-01-07' },
    ],
    recurring: [{ id: 'r1', name: 'Rent', categoryId: 'needs', subcategory: 'Rent', amount: 25000, dayOfMonth: 1, active: true, generatedMonths: [] }],
    goals: [{ id: 'g1', title: 'Laptop', targetAmount: 1000, currentAmount: 100, monthlyContribution: 50 }],
    emergencyFund: { currentAmount: 5000, coverageMonths: 3 },
    notificationSettings: { salaryReminder: false, budgetExceeded: true },
  };
}

test('a legacy salary becomes a monthly income source, keeping its payment day', () => {
  const state = migrateState(legacyState());
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.incomeSources.length, 2);
  const [primary, other] = state.incomeSources;
  assert.equal(primary.amount, 80000);
  assert.equal(primary.frequency, 'monthly');
  assert.equal(primary.paymentDay, 5);
  assert.equal(other.amount, 20000);
  assert.ok(primary.id && other.id);
});

test('legacy salary fields are dropped from the profile', () => {
  const state = migrateState(legacyState());
  assert.equal('monthlySalary' in state.profile, false);
  assert.equal('otherIncome' in state.profile, false);
  assert.equal('salaryPaymentDate' in state.profile, false);
});

test('old category and subcategory names are remapped to the generic set', () => {
  const state = migrateState(legacyState());
  assert.deepEqual(state.expenses.map((e) => `${e.categoryId}/${e.subcategory}`), [
    'financial/Savings', 'needs/Housing', 'financial/Debt Payment',
  ]);
  assert.equal(state.recurring[0].categoryId, 'needs');
  assert.equal(state.recurring[0].subcategory, 'Housing');
});

test('each expense keeps the budget kind it was recorded against', () => {
  const state = migrateState(legacyState());
  assert.deepEqual(state.expenses.map((e) => e.categoryKind), ['savings', 'needs', 'debt']);
});

test('the renamed income notification keeps the user\'s original choice', () => {
  const state = migrateState(legacyState());
  assert.equal(state.notificationSettings.incomeReminder, false);
  assert.equal('salaryReminder' in state.notificationSettings, false);
  assert.equal(state.notificationSettings.budgetExceeded, true);
});

test('everything else the user owned survives untouched', () => {
  const state = migrateState(legacyState());
  assert.equal(state.profile.currency, 'PKR');
  assert.equal(state.profile.name, 'Previous user');
  assert.equal(state.goals.length, 1);
  assert.equal(state.emergencyFund.currentAmount, 5000);
  assert.equal(state.emergencyFund.coverageMonths, 3);
});

test('migrating already-current data changes nothing', () => {
  const current = migrateState(legacyState());
  const again = migrateState(current);
  assert.deepEqual(again.incomeSources, current.incomeSources);
  assert.deepEqual(again.expenses, current.expenses);
  assert.equal(again.schemaVersion, SCHEMA_VERSION);
});

test('a state with no income at all migrates to an empty source list', () => {
  const empty = { schemaVersion: 1, profile: { currency: 'USD', monthlySalary: 0, otherIncome: 0 } };
  const state = migrateState(empty);
  assert.deepEqual(state.incomeSources, []);
  assert.equal(state.expenses.length, 0);
});
