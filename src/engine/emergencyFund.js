// Emergency Fund calculations: target is derived from the user's
// essential (Needs) monthly expenses and a chosen coverage window.

export function calculateTarget(essentialMonthlyExpenses, months) {
  return Math.round((Number(essentialMonthlyExpenses) || 0) * (Number(months) || 0) * 100) / 100;
}

export function calculateProgress(currentAmount, target) {
  const current = Number(currentAmount) || 0;
  const t = Number(target) || 0;
  const progressPercent = t > 0 ? Math.min(100, Math.round((current / t) * 10000) / 100) : 0;
  const remaining = Math.max(0, Math.round((t - current) * 100) / 100);
  return { current, target: t, progressPercent, remaining, isComplete: t > 0 && current >= t };
}

export function estimateMonthsToTarget(remaining, monthlyContribution) {
  const contribution = Number(monthlyContribution) || 0;
  if (contribution <= 0) return null;
  return Math.ceil((Number(remaining) || 0) / contribution);
}

export const COVERAGE_PRESETS = Object.freeze([
  { id: '3-month', label: '3 Months', months: 3 },
  { id: '6-month', label: '6 Months', months: 6 },
  { id: 'custom', label: 'Custom', months: null },
]);
