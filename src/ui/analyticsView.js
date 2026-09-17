import { h, mount, page, progressBar, selectInput, field, textInput, button, emptyState } from './components.js';
import { donutChart, barChart, legend, colorFor } from './charts.js';
import { formatMoney } from '../engine/currency.js';
import { store, currentMonthKey } from '../store.js';

const RANGE_OPTIONS = [
  { value: 'current', label: 'Current Month' },
  { value: 'previous', label: 'Previous Month' },
  { value: 'last3', label: 'Last 3 Months' },
  { value: 'last6', label: 'Last 6 Months' },
  { value: 'last12', label: 'Last 12 Months' },
  { value: 'custom', label: 'Custom Range' },
];

function monthKeysBack(n) {
  const keys = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function rangeToMonthKeys(range, customStart, customEnd) {
  switch (range) {
    case 'previous': {
      const d = new Date(); d.setMonth(d.getMonth() - 1);
      return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`];
    }
    case 'last3': return monthKeysBack(3);
    case 'last6': return monthKeysBack(6);
    case 'last12': return monthKeysBack(12);
    case 'custom': {
      if (!customStart || !customEnd) return [currentMonthKey()];
      const keys = [];
      let cursor = new Date(customStart.slice(0, 7) + '-01');
      const end = new Date(customEnd.slice(0, 7) + '-01');
      while (cursor <= end) {
        keys.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
        cursor.setMonth(cursor.getMonth() + 1);
      }
      return keys;
    }
    default: return [currentMonthKey()];
  }
}

export function renderAnalyticsView(root, { navigate }) {
  let range = 'current';
  let customStart = '';
  let customEnd = '';

  function render() {
    const currency = store.state.profile.currency;
    const monthKeys = rangeToMonthKeys(range, customStart, customEnd);
    const expenses = monthKeys.flatMap((mk) => store.expensesForMonth(mk));

    const byKind = { needs: 0, wants: 0, savings: 0, debt: 0 };
    const byCategory = {};
    for (const e of expenses) {
      byKind[e.categoryKind] = (byKind[e.categoryKind] || 0) + e.amount;
      const key = e.subcategory || e.categoryId;
      byCategory[key] = (byCategory[key] || 0) + e.amount;
    }
    const kindData = Object.entries(byKind).filter(([, v]) => v > 0).map(([k, v]) => ({ id: k, label: capitalize(k), value: Math.round(v * 100) / 100 }));
    const categoryData = Object.entries(byCategory).map(([k, v], i) => ({ id: k, label: k, value: Math.round(v * 100) / 100, color: colorFor(k, i) }));

    const monthlySpendTrend = monthKeys.map((mk) => {
      const total = store.expensesForMonth(mk).reduce((a, e) => a + e.amount, 0);
      return { label: mk.slice(5), value: Math.round(total * 100) / 100 };
    });
    const monthlySavingsTrend = monthKeys.map((mk) => {
      const total = store.expensesForMonth(mk).filter((e) => e.categoryKind === 'savings').reduce((a, e) => a + e.amount, 0);
      return { label: mk.slice(5), value: Math.round(total * 100) / 100, color: colorFor('savings') };
    });

    const emergencyFund = store.getEmergencyFundStatus();
    const goals = store.getGoalsWithProgress();

    const customRangeFields = range === 'custom' ? h('div', { class: 'custom-range-fields' }, [
      field('From', textInput({ type: 'date', value: customStart, oninput: (v) => { customStart = v; render(); } })),
      field('To', textInput({ type: 'date', value: customEnd, oninput: (v) => { customEnd = v; render(); } })),
    ]) : null;

    const content = page('Analytics', [
      field('Date range', selectInput({ options: RANGE_OPTIONS, value: range, onchange: (v) => { range = v; render(); } })),
      customRangeFields,

      h('div', { class: 'section-title' }, 'Needs vs Wants vs Savings'),
      kindData.length ? chartCard(donutChart(kindData), legend(kindData)) : emptyState('No expenses in this range.'),

      h('div', { class: 'section-title' }, 'Spending by Category'),
      categoryData.length ? chartCard(donutChart(categoryData), legend(categoryData)) : emptyState('No expenses in this range.'),

      h('div', { class: 'section-title' }, 'Monthly Spending'),
      chartCard(barChart(monthlySpendTrend)),

      h('div', { class: 'section-title' }, 'Monthly Savings'),
      chartCard(barChart(monthlySavingsTrend, { barColor: colorFor('savings') })),

      h('div', { class: 'section-title' }, 'Emergency Fund Progress'),
      h('div', { class: 'card' }, [
        progressBar(emergencyFund.progressPercent, emergencyFund.isComplete ? 'ok' : 'approaching'),
        h('div', { class: 'text-muted small' }, `${formatMoney(emergencyFund.current, currency)} / ${formatMoney(emergencyFund.target, currency)} (${emergencyFund.progressPercent}%)`),
      ]),

      h('div', { class: 'section-title' }, 'Goal Progress'),
      goals.length ? h('div', {}, goals.map((g) => h('div', { class: 'card' }, [
        h('div', { class: 'budget-card-head' }, [h('span', {}, g.title), h('span', {}, `${g.progress.progressPercent}%`)]),
        progressBar(g.progress.progressPercent, g.progress.isComplete ? 'ok' : 'approaching'),
      ]))) : emptyState('No goals yet.'),

      button('View Monthly Report', { className: 'btn-block', onClick: () => navigate('#/report') }),
    ], { back: () => navigate('#/home') });
    mount(root, content);
  }

  render();
}

function chartCard(...nodes) {
  return h('div', { class: 'card chart-card' }, nodes);
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
