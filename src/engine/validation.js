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

export function validateOnboardingInput({ currency, monthlySalary }) {
  const errors = {};
  if (!currency) errors.currency = 'Select a currency.';
  if (!isPositiveNumber(monthlySalary)) errors.monthlySalary = 'Enter your monthly salary/income.';
  return { valid: Object.keys(errors).length === 0, errors };
}

export function validateGoalInput({ title, targetAmount }) {
  const errors = {};
  if (!title) errors.title = 'Enter a goal name.';
  if (!isPositiveNumber(targetAmount)) errors.targetAmount = 'Enter a target amount greater than 0.';
  return { valid: Object.keys(errors).length === 0, errors };
}
