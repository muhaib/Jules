// Smart financial insights: simple, factual comparisons — never framed as
// universal financial rules. Anything tied to the user's chosen budgeting
// rule is phrased as "according to your selected rule", not as an
// objective verdict on the user's finances.

import { formatMoney } from './currency.js';

export function sumByCategory(expenses) {
  const totals = {};
  for (const e of expenses) {
    const key = e.subcategory || e.categoryId;
    totals[key] = (totals[key] || 0) + (Number(e.amount) || 0);
  }
  return totals;
}

export function categoryTotalsList(expenses) {
  const totals = sumByCategory(expenses);
  return Object.entries(totals).map(([category, amount]) => ({ category, amount: Math.round(amount * 100) / 100 }));
}

export function buildInsights({ currentSnapshot, previousSnapshot, currentExpenses, previousExpenses, emergencyFund, currency }) {
  const insights = [];

  // Category-level month-over-month comparison.
  const currentByCategory = sumByCategory(currentExpenses);
  const previousByCategory = sumByCategory(previousExpenses);
  for (const [category, amount] of Object.entries(currentByCategory)) {
    const prevAmount = previousByCategory[category] || 0;
    const diff = Math.round((amount - prevAmount) * 100) / 100;
    if (prevAmount > 0 && Math.abs(diff) >= Math.max(500, prevAmount * 0.25)) {
      const direction = diff > 0 ? 'more' : 'less';
      insights.push({
        type: diff > 0 ? 'spending-increase' : 'spending-decrease',
        message: `You spent ${formatMoney(Math.abs(diff), currency)} ${direction} on ${category} this month than last month.`,
      });
    }
  }

  // Rule-benchmark comparison per group (framed as a benchmark, not a verdict).
  if (currentSnapshot) {
    for (const g of currentSnapshot.groups) {
      if (g.allocated <= 0) continue;
      const deviation = Math.round((g.percentUsed - 100) * 10) / 10;
      if (deviation >= 5) {
        insights.push({
          type: 'benchmark-deviation',
          message: `According to your selected budgeting rule, your ${g.label} spending is currently ${deviation}% above the monthly benchmark.`,
        });
      }
    }
  }

  // Savings comparison.
  if (currentSnapshot && previousSnapshot) {
    const savingsDiff = Math.round((currentSnapshot.totalSavingsSpent - previousSnapshot.totalSavingsSpent) * 100) / 100;
    if (Math.abs(savingsDiff) >= 100) {
      const direction = savingsDiff > 0 ? 'more' : 'less';
      insights.push({
        type: savingsDiff > 0 ? 'savings-increase' : 'savings-decrease',
        message: `You saved ${formatMoney(Math.abs(savingsDiff), currency)} ${direction} this month than last month.`,
      });
    }
  }

  // Emergency fund distance-to-target.
  if (emergencyFund && emergencyFund.target > 0 && !emergencyFund.isComplete) {
    insights.push({
      type: 'emergency-fund-gap',
      message: `Your emergency fund is ${formatMoney(emergencyFund.remaining, currency)} away from your selected target.`,
    });
  }

  return insights;
}
