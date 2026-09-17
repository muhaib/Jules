// Dynamic budget calculation. Nothing here is hard-coded per rule — the
// same functions work for any rule produced by rules.js, so changing
// income or switching rules automatically recalculates every limit.

import { resolveGroups } from './rules.js';

export const STATUS = Object.freeze({
  OK: 'ok', // 🟢 within budget
  APPROACHING: 'approaching', // 🟡 75-79%
  HIGH: 'high', // 🟠 80-99%
  EXCEEDED: 'exceeded', // 🔴 100%+
});

/**
 * Turn resolved groups into concrete Rupee (or whatever currency) amounts
 * for the given total monthly income.
 */
export function calculateAllocations(rule, income, config) {
  const groups = resolveGroups(rule, config);
  const total = Number(income) || 0;

  // Pay Yourself First in fixed-amount mode: savings is a flat amount,
  // spending gets whatever remains (never negative).
  const hasFixed = groups.some((g) => g.fixedAmount !== undefined);
  if (hasFixed) {
    const savingsGroup = groups.find((g) => g.id === 'savings');
    const spendingGroup = groups.find((g) => g.id === 'spending');
    const savingsAmount = Math.min(Number(savingsGroup.fixedAmount) || 0, total);
    const spendingAmount = Math.max(total - savingsAmount, 0);
    return [
      { ...savingsGroup, percent: total > 0 ? (savingsAmount / total) * 100 : 0, allocated: savingsAmount },
      { ...spendingGroup, percent: total > 0 ? (spendingAmount / total) * 100 : 0, allocated: spendingAmount },
    ];
  }

  return groups.map((g) => ({
    ...g,
    allocated: round2((Number(g.percent) || 0) / 100 * total),
  }));
}

/**
 * Sum expenses into each allocation group by matching expense.categoryKind
 * against group.kind. An expense whose kind doesn't match any group in the
 * active rule (e.g. a debt expense under a rule with no debt group) is
 * still returned in `unassignedSpent` so nothing silently disappears.
 */
export function calculateSpentByGroup(allocations, expenses) {
  const spentByGroupId = Object.fromEntries(allocations.map((g) => [g.id, 0]));
  let unassignedSpent = 0;

  for (const expense of expenses) {
    const amount = Number(expense.amount) || 0;
    const group = allocations.find((g) => g.kind.includes(expense.categoryKind));
    if (group) {
      spentByGroupId[group.id] += amount;
    } else {
      unassignedSpent += amount;
    }
  }

  for (const id of Object.keys(spentByGroupId)) {
    spentByGroupId[id] = round2(spentByGroupId[id]);
  }
  return { spentByGroupId, unassignedSpent: round2(unassignedSpent) };
}

export function statusForPercentUsed(percentUsed, thresholds = [75, 80, 90, 100]) {
  const [approach, high, , exceeded] = thresholds;
  if (percentUsed >= (exceeded ?? 100)) return STATUS.EXCEEDED;
  if (percentUsed >= (high ?? 80)) return STATUS.HIGH;
  if (percentUsed >= (approach ?? 75)) return STATUS.APPROACHING;
  return STATUS.OK;
}

/**
 * Full budget snapshot for a rule/income/expense set: per-group spend,
 * remaining, percent used and status, plus overall income/expense/savings
 * roll-ups.
 */
export function computeBudgetSnapshot({ rule, income, config, expenses, otherIncome = 0 }) {
  const totalIncome = (Number(income) || 0) + (Number(otherIncome) || 0);
  const allocations = calculateAllocations(rule, totalIncome, config);
  const { spentByGroupId, unassignedSpent } = calculateSpentByGroup(allocations, expenses);
  const thresholds = rule?.alertThresholds || [75, 80, 90, 100];

  const groups = allocations.map((g) => {
    const spent = spentByGroupId[g.id] || 0;
    const allocated = g.allocated;
    const percentUsed = allocated > 0 ? round2((spent / allocated) * 100) : (spent > 0 ? 100 : 0);
    const remaining = round2(allocated - spent);
    return {
      id: g.id,
      label: g.label,
      kind: g.kind,
      percent: g.percent,
      allocated,
      spent: round2(spent),
      remaining,
      percentUsed,
      status: statusForPercentUsed(percentUsed, thresholds),
      exceededBy: remaining < 0 ? round2(-remaining) : 0,
    };
  });

  const totalSpent = round2(groups.reduce((acc, g) => acc + g.spent, 0) + unassignedSpent);
  const totalSavingsSpent = groups
    .filter((g) => g.kind.includes('savings'))
    .reduce((acc, g) => acc + g.spent, 0);
  const remainingIncome = round2(totalIncome - totalSpent);
  const savingsRate = totalIncome > 0 ? round2((totalSavingsSpent / totalIncome) * 100) : 0;

  return {
    totalIncome,
    totalSpent,
    remainingIncome,
    totalSavingsSpent: round2(totalSavingsSpent),
    savingsRate,
    unassignedSpent,
    groups,
  };
}

/**
 * "Can I afford this?" — check a planned purchase against the group it
 * would count against without mutating any state.
 */
export function previewExpenseImpact(snapshot, { amount, categoryKind }) {
  const plannedAmount = Number(amount) || 0;
  const group = snapshot.groups.find((g) => g.kind.includes(categoryKind));
  if (!group) {
    return { group: null, willExceed: false, exceededBy: 0, newSpent: plannedAmount, newRemaining: null };
  }
  const newSpent = round2(group.spent + plannedAmount);
  const newRemaining = round2(group.allocated - newSpent);
  return {
    group,
    willExceed: newRemaining < 0,
    exceededBy: newRemaining < 0 ? round2(-newRemaining) : 0,
    newSpent,
    newRemaining,
  };
}

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
