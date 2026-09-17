// Financial goals: target-based savings tracking with a projected
// completion date from the user's chosen monthly contribution.

export const GOAL_TEMPLATES = Object.freeze([
  'Buy Laptop', 'Car', 'House', 'Education', 'Vacation', 'Wedding', 'Emergency Fund', 'Custom Goal',
]);

export function goalProgress(goal) {
  const current = Number(goal.currentAmount) || 0;
  const target = Number(goal.targetAmount) || 0;
  const remaining = Math.max(0, Math.round((target - current) * 100) / 100);
  const progressPercent = target > 0 ? Math.min(100, Math.round((current / target) * 10000) / 100) : 0;
  const monthlyContribution = Number(goal.monthlyContribution) || 0;
  const monthsToComplete = monthlyContribution > 0 ? Math.ceil(remaining / monthlyContribution) : null;

  let estimatedCompletionDate = null;
  if (monthsToComplete !== null) {
    const d = new Date();
    d.setMonth(d.getMonth() + monthsToComplete);
    estimatedCompletionDate = d.toISOString().slice(0, 10);
  }

  return {
    remaining,
    progressPercent,
    monthsToComplete,
    estimatedCompletionDate,
    isComplete: target > 0 && current >= target,
  };
}

export function totalMonthlyGoalContributions(goals) {
  return Math.round(goals.reduce((acc, g) => acc + (Number(g.monthlyContribution) || 0), 0) * 100) / 100;
}
