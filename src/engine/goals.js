// Financial goals: any personal savings target, tracked against both the
// user's chosen monthly contribution (when will I get there?) and their
// target date (what would I need to put aside to make it?).

export const GOAL_TEMPLATES = Object.freeze([
  'New phone', 'Laptop', 'Car', 'House', 'Education', 'Vacation',
  'Wedding', 'Emergency Fund', 'Retirement', 'Custom goal',
]);

/** Whole months from `from` up to `to`, never negative. */
export function monthsUntil(targetDate, from = new Date()) {
  if (!targetDate) return null;
  const target = new Date(targetDate);
  if (Number.isNaN(target.getTime())) return null;
  const months = (target.getFullYear() - from.getFullYear()) * 12 + (target.getMonth() - from.getMonth());
  return Math.max(0, months);
}

export function goalProgress(goal, today = new Date()) {
  const current = Math.max(0, Number(goal.currentAmount) || 0);
  const target = Math.max(0, Number(goal.targetAmount) || 0);
  const remaining = Math.max(0, round2(target - current));
  const progressPercent = target > 0 ? Math.min(100, Math.round((current / target) * 10000) / 100) : 0;
  const monthlyContribution = Math.max(0, Number(goal.monthlyContribution) || 0);
  const isComplete = target > 0 && current >= target;

  const monthsToComplete = !isComplete && monthlyContribution > 0
    ? Math.ceil(remaining / monthlyContribution)
    : (isComplete ? 0 : null);

  let estimatedCompletionDate = null;
  if (monthsToComplete !== null && !isComplete) {
    const d = new Date(today.getFullYear(), today.getMonth() + monthsToComplete, today.getDate());
    estimatedCompletionDate = d.toISOString().slice(0, 10);
  }

  // What they'd need to set aside each month to hit their target date. A
  // target date this month (or already past) means the whole remainder.
  const monthsRemaining = monthsUntil(goal.targetDate, today);
  const requiredMonthlyContribution = monthsRemaining === null || isComplete
    ? null
    : (monthsRemaining > 0 ? round2(remaining / monthsRemaining) : remaining);

  const onTrack = requiredMonthlyContribution === null
    ? null
    : monthlyContribution >= requiredMonthlyContribution;

  return {
    remaining,
    progressPercent,
    monthsToComplete,
    estimatedCompletionDate,
    monthsRemaining,
    requiredMonthlyContribution,
    onTrack,
    isComplete,
  };
}

export function totalMonthlyGoalContributions(goals) {
  return round2((goals || []).reduce((acc, g) => acc + Math.max(0, Number(g.monthlyContribution) || 0), 0));
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
