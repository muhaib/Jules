export function isPositiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

export function isNonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

export function validateExpenseInput({ amount, categoryId, subcategory, date }) {
  const errors = {};
  if (!isPositiveNumber(amount)) errors.amount = 'Enter an amount greater than 0.';
  if (!categoryId) errors.categoryId = 'Select a category.';
  if (!subcategory) errors.subcategory = 'Select a subcategory.';
  if (!date) errors.date = 'Select a date.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateIncomeSource({ amount, frequency, everyMonths, date }) {
  const errors = {};
  if (!isPositiveNumber(amount)) errors.amount = 'Enter an amount greater than 0.';
  if (frequency === 'custom' && !isPositiveNumber(everyMonths)) errors.everyMonths = 'Enter how many months between payments.';
  if (frequency === 'one-time' && !date) errors.date = 'Select the date this income arrives.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateOnboardingInput({ currency, incomeSources }) {
  const errors = {};
  if (!currency) errors.currency = 'Select a currency.';
  const sources = incomeSources || [];
  if (sources.length === 0 || !sources.some((s) => isPositiveNumber(s.amount))) {
    errors.incomeSources = 'Add at least one income source with an amount greater than 0.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateGoalInput({ title, targetAmount, currentAmount }) {
  const errors = {};
  if (!title) errors.title = 'Enter a goal name.';
  if (!isPositiveNumber(targetAmount)) errors.targetAmount = 'Enter a target amount greater than 0.';
  if (currentAmount !== undefined && currentAmount !== '' && !isNonNegativeNumber(currentAmount)) {
    errors.currentAmount = 'Enter a current amount of 0 or more.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}
