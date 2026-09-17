// The budgeting-rule engine. This is the reusable core described in the
// spec's "Rule Engine" section: budgeting rules are DATA (name, groups,
// percentages, alert thresholds), never hard-coded into the UI. New rules
// can be added by appending to BUILTIN_RULES (or, for end users, by
// creating a 'custom' rule) without touching any calculation or view code.
//
// A rule's `groups` describe how 100% of income is allocated. Each group
// carries a `kind` array pointing at which category kinds (needs / wants /
// savings / debt, see categories.js) count against it, so an expense in any
// matching category is automatically attributed to the right group.

import { KINDS } from './categories.js';

export const RULE_TYPES = Object.freeze({
  PERCENTAGE: 'percentage', // fixed % split of income across groups
  PAY_YOURSELF_FIRST: 'pay-yourself-first', // savings taken first, remainder is one spending pool
  CUSTOM: 'custom', // user-defined groups/percentages
});

export const DEFAULT_ALERT_THRESHOLDS = Object.freeze([75, 80, 90, 100]);

export const BUILTIN_RULES = Object.freeze([
  {
    id: '50-30-20',
    name: '50/30/20 Rule',
    tagline: '50% Needs · 30% Wants · 20% Savings/Investments',
    type: RULE_TYPES.PERCENTAGE,
    editable: false,
    groups: [
      { id: 'needs', label: 'Needs', kind: [KINDS.NEEDS], percent: 50 },
      { id: 'wants', label: 'Wants', kind: [KINDS.WANTS], percent: 30 },
      { id: 'savings', label: 'Savings', kind: [KINDS.SAVINGS], percent: 20 },
    ],
    alertThresholds: DEFAULT_ALERT_THRESHOLDS,
  },
  {
    id: '70-20-10',
    name: '70/20/10 Rule',
    tagline: '70% Expenses · 20% Savings · 10% Debt/Other Goals',
    type: RULE_TYPES.PERCENTAGE,
    editable: false,
    groups: [
      { id: 'expenses', label: 'Expenses', kind: [KINDS.NEEDS, KINDS.WANTS], percent: 70 },
      { id: 'savings', label: 'Savings', kind: [KINDS.SAVINGS], percent: 20 },
      { id: 'debt', label: 'Debt/Other Goals', kind: [KINDS.DEBT], percent: 10 },
    ],
    alertThresholds: DEFAULT_ALERT_THRESHOLDS,
  },
  {
    id: '80-20',
    name: '80/20 Rule',
    tagline: '80% Spending · 20% Savings',
    type: RULE_TYPES.PERCENTAGE,
    editable: false,
    groups: [
      { id: 'spending', label: 'Spending', kind: [KINDS.NEEDS, KINDS.WANTS], percent: 80 },
      { id: 'savings', label: 'Savings', kind: [KINDS.SAVINGS], percent: 20 },
    ],
    alertThresholds: DEFAULT_ALERT_THRESHOLDS,
  },
  {
    id: 'pay-yourself-first',
    name: 'Pay Yourself First',
    tagline: 'Save a fixed amount or percentage before anything else',
    type: RULE_TYPES.PAY_YOURSELF_FIRST,
    editable: true,
    // config: { savingsMode: 'percent' | 'fixed', savingsPercent, savingsFixedAmount }
    defaultConfig: { savingsMode: 'percent', savingsPercent: 20, savingsFixedAmount: 0 },
    groups: [
      { id: 'savings', label: 'Savings', kind: [KINDS.SAVINGS], percent: 20 },
      { id: 'spending', label: 'Spending', kind: [KINDS.NEEDS, KINDS.WANTS, KINDS.DEBT], percent: 80 },
    ],
    alertThresholds: DEFAULT_ALERT_THRESHOLDS,
  },
  {
    id: 'custom',
    name: 'Custom Rule',
    tagline: 'Define your own categories and percentages',
    type: RULE_TYPES.CUSTOM,
    editable: true,
    // config: { customGroups: [{id,label,kind:[...],percent}] }
    defaultConfig: {
      customGroups: [
        { id: 'needs', label: 'Needs', kind: [KINDS.NEEDS], percent: 50 },
        { id: 'wants', label: 'Wants', kind: [KINDS.WANTS], percent: 30 },
        { id: 'savings', label: 'Savings', kind: [KINDS.SAVINGS], percent: 20 },
      ],
    },
    alertThresholds: DEFAULT_ALERT_THRESHOLDS,
  },
]);

export function getRule(ruleId) {
  return BUILTIN_RULES.find((r) => r.id === ruleId) || null;
}

export function listRules() {
  return BUILTIN_RULES;
}

/**
 * Resolve the effective groups for a rule given its live config, WITHOUT
 * computing amounts yet (see budget.js for that). Percentages here always
 * sum to 100 for a valid rule.
 */
export function resolveGroups(rule, config) {
  if (!rule) return [];
  if (rule.type === RULE_TYPES.CUSTOM) {
    const groups = (config && config.customGroups) || rule.defaultConfig.customGroups;
    return groups.map((g) => ({ ...g }));
  }
  if (rule.type === RULE_TYPES.PAY_YOURSELF_FIRST) {
    const cfg = { ...rule.defaultConfig, ...(config || {}) };
    if (cfg.savingsMode === 'fixed') {
      // Percent is resolved against income later (fixed amount case) —
      // here we just flag it so budget.js can special-case the split.
      return [
        { id: 'savings', label: 'Savings', kind: [KINDS.SAVINGS], percent: null, fixedAmount: cfg.savingsFixedAmount },
        { id: 'spending', label: 'Spending', kind: [KINDS.NEEDS, KINDS.WANTS, KINDS.DEBT], percent: null },
      ];
    }
    const savingsPercent = Number(cfg.savingsPercent) || 0;
    return [
      { id: 'savings', label: 'Savings', kind: [KINDS.SAVINGS], percent: savingsPercent },
      { id: 'spending', label: 'Spending', kind: [KINDS.NEEDS, KINDS.WANTS, KINDS.DEBT], percent: 100 - savingsPercent },
    ];
  }
  // PERCENTAGE type: fixed, data-defined groups.
  return rule.groups.map((g) => ({ ...g }));
}

export function validateGroupPercentages(groups) {
  const sum = groups.reduce((acc, g) => acc + (Number(g.percent) || 0), 0);
  return Math.abs(sum - 100) < 0.01;
}
