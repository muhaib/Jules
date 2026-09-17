// Monthly financial report generator.

import { round2 } from './budget.js';

export function generateMonthlyReport({ monthLabel, snapshot, previousSnapshot, emergencyFundContribution, goalContributions }) {
  const largestCategories = [...(snapshot.categoryTotals || [])]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const exceededGroups = snapshot.groups.filter((g) => g.status === 'exceeded');

  const comparison = previousSnapshot ? {
    incomeDiff: round2(snapshot.totalIncome - previousSnapshot.totalIncome),
    expensesDiff: round2(snapshot.totalSpent - previousSnapshot.totalSpent),
    savingsDiff: round2(snapshot.totalSavingsSpent - previousSnapshot.totalSavingsSpent),
  } : null;

  return {
    monthLabel,
    totalIncome: snapshot.totalIncome,
    totalExpenses: snapshot.totalSpent,
    totalSavings: snapshot.totalSavingsSpent,
    savingsRate: snapshot.savingsRate,
    groups: snapshot.groups,
    exceededGroups,
    largestCategories,
    emergencyFundContribution: round2(emergencyFundContribution || 0),
    goalContributions: round2(goalContributions || 0),
    comparison,
  };
}
