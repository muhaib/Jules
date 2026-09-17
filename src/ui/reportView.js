import { h, mount, page, statusPill, selectInput, field, button } from './components.js';
import { formatMoney } from '../engine/currency.js';
import { store, currentMonthKey } from '../store.js';

function lastNMonthKeys(n) {
  const keys = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

export function renderReportView(root, { navigate }) {
  let monthKey = currentMonthKey();

  function render() {
    const currency = store.state.profile.currency;
    const report = store.getMonthlyReport(monthKey);
    const options = lastNMonthKeys(12).map((mk) => {
      const [y, m] = mk.split('-').map(Number);
      return { value: mk, label: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) };
    });

    const content = page('Monthly Report', [
      field('Month', selectInput({ options, value: monthKey, onchange: (v) => { monthKey = v; render(); } })),

      h('div', { class: 'card report-summary' }, [
        h('h2', {}, `${report.monthLabel} Financial Summary`),
        reportRow('Income', formatMoney(report.totalIncome, currency)),
        reportRow('Expenses', formatMoney(report.totalExpenses, currency)),
        reportRow('Savings', formatMoney(report.totalSavings, currency)),
        reportRow('Savings Rate', `${report.savingsRate}%`),
      ]),

      h('div', { class: 'section-title' }, 'Budget Groups'),
      h('div', {}, report.groups.map((g) => h('div', { class: 'card' }, [
        h('div', { class: 'budget-card-head' }, [h('span', { class: 'text-strong' }, g.label), statusPill(g.status)]),
        reportRow('Spent', formatMoney(g.spent, currency)),
        reportRow('Budget', formatMoney(g.allocated, currency)),
        g.status === 'exceeded' ? h('div', { class: 'text-danger' }, `⚠️ ${formatMoney(g.exceededBy, currency)} over budget`) : null,
      ]))),

      report.largestCategories.length ? h('div', {}, [
        h('div', { class: 'section-title' }, 'Largest Spending Categories'),
        h('div', { class: 'card' }, report.largestCategories.map((c) => reportRow(c.category, formatMoney(c.amount, currency)))),
      ]) : null,

      h('div', { class: 'section-title' }, 'Contributions'),
      h('div', { class: 'card' }, [
        reportRow('Emergency Fund', formatMoney(report.emergencyFundContribution, currency)),
        reportRow('Financial Goals', formatMoney(report.goalContributions, currency)),
      ]),

      report.comparison ? h('div', {}, [
        h('div', { class: 'section-title' }, 'Compared to Previous Month'),
        h('div', { class: 'card' }, [
          reportRow('Income', diffLabel(report.comparison.incomeDiff, currency)),
          reportRow('Expenses', diffLabel(report.comparison.expensesDiff, currency)),
          reportRow('Savings', diffLabel(report.comparison.savingsDiff, currency)),
        ]),
      ]) : null,

      button('Export Report as JSON', { variant: 'ghost', className: 'btn-block', onClick: () => downloadReport(report) }),
    ], { back: () => navigate('#/analytics') });
    mount(root, content);
  }

  render();
}

function reportRow(label, value) {
  return h('div', { class: 'income-row' }, [h('span', {}, label), h('span', { class: 'text-strong' }, value)]);
}

function diffLabel(diff, currency) {
  const sign = diff > 0 ? '+' : '';
  return `${sign}${formatMoney(diff, currency)}`;
}

function downloadReport(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `smartbudget-report-${report.monthLabel.replace(' ', '-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
