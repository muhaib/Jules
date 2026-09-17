// Smart alert system. Alerts are derived purely from a budget snapshot
// (see budget.js) so they stay in sync with real-time spending.

import { formatMoney } from './currency.js';

export const ALERT_LEVEL = Object.freeze({
  INFO: 'info', // 75%
  WARNING: 'warning', // 80-99%
  DANGER: 'danger', // 100%+
});

/**
 * Build the list of active alerts for the current budget snapshot. Only
 * the highest threshold crossed per group is surfaced (no duplicate noise
 * for a group that's both >=75% and >=90%).
 */
export function buildAlerts(snapshot, currency) {
  const alerts = [];
  for (const g of snapshot.groups) {
    const p = g.percentUsed;
    if (p >= 100) {
      alerts.push({
        id: `${g.id}-exceeded`,
        groupId: g.id,
        level: ALERT_LEVEL.DANGER,
        icon: '🔴',
        message: `Your ${g.label} budget has been exceeded.`,
        detail: `Budget: ${formatMoney(g.allocated, currency)} · Spent: ${formatMoney(g.spent, currency)} · Exceeded by: ${formatMoney(g.exceededBy, currency)}`,
      });
    } else if (p >= 90) {
      alerts.push({
        id: `${g.id}-90`,
        groupId: g.id,
        level: ALERT_LEVEL.WARNING,
        icon: '⚠️',
        message: `Your ${g.label} budget is almost finished. Only ${formatMoney(g.remaining, currency)} remains.`,
      });
    } else if (p >= 80) {
      alerts.push({
        id: `${g.id}-80`,
        groupId: g.id,
        level: ALERT_LEVEL.WARNING,
        icon: '⚠️',
        message: `You've used ${Math.round(p)}% of your ${g.label} budget.`,
      });
    } else if (p >= 75) {
      alerts.push({
        id: `${g.id}-75`,
        groupId: g.id,
        level: ALERT_LEVEL.INFO,
        icon: 'ℹ️',
        message: `${Math.round(p)}% of your ${g.label} budget has been used.`,
      });
    }
  }
  return alerts;
}

/**
 * Pre-save check used by the Add Expense flow: warns (but never blocks)
 * when the expense about to be saved would push a group over budget.
 */
export function buildPreSaveWarning(preview, groupLabel, currency) {
  if (!preview.group || !preview.willExceed) return null;
  return {
    icon: '⚠️',
    message: `This expense will exceed your ${groupLabel} budget by ${formatMoney(preview.exceededBy, currency)}.`,
  };
}

export function statusLabel(status) {
  switch (status) {
    case 'exceeded': return { icon: '🔴', label: 'Over Budget' };
    case 'high': return { icon: '🟠', label: 'High Usage' };
    case 'approaching': return { icon: '🟡', label: 'Approaching Limit' };
    default: return { icon: '🟢', label: 'Within Budget' };
  }
}
