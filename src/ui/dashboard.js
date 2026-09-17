import { h, mount, page, budgetGroupCard, button, alertBanner, emptyState } from './components.js';
import { formatMoney } from '../engine/currency.js';
import { store, currentMonthKey } from '../store.js';

export function renderDashboard(root, { navigate }) {
  const monthKey = currentMonthKey();
  const snapshot = store.getSnapshot(monthKey);
  const alerts = store.getAlerts(monthKey);
  const currency = store.state.profile.currency;
  const emergencyFund = store.getEmergencyFundStatus();
  const goals = store.getGoalsWithProgress();
  const recentExpenses = [...store.expensesForMonth(monthKey)].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 5);
  const monthLabel = new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const incomeSources = store.incomeBreakdown(monthKey).filter((s) => s.monthlyAmount > 0);

  const content = page(`Hi${store.state.profile.name ? ', ' + store.state.profile.name : ''} 👋`, [
    h('div', { class: 'text-muted month-label' }, monthLabel),

    h('div', { class: 'card income-card' }, [
      h('div', { class: 'income-row' }, [
        h('span', {}, 'Income This Month'),
        h('span', { class: 'text-strong' }, formatMoney(snapshot.totalIncome, currency)),
      ]),
      incomeSources.length > 1
        ? h('div', { class: 'income-sources' }, incomeSources.map((source) => h('div', { class: 'income-row income-source-row' }, [
          h('span', { class: 'text-muted small' }, source.label || source.type),
          h('span', { class: 'text-muted small' }, formatMoney(source.monthlyAmount, currency)),
        ])))
        : null,
      h('div', { class: 'income-row' }, [
        h('span', {}, 'Spent So Far'),
        h('span', {}, formatMoney(snapshot.totalSpent, currency)),
      ]),
      h('div', { class: 'income-row income-remaining' }, [
        h('span', {}, 'Remaining'),
        h('span', { class: snapshot.remainingIncome < 0 ? 'text-danger' : 'text-strong' }, formatMoney(snapshot.remainingIncome, currency)),
      ]),
    ]),

    alerts.length ? h('div', { class: 'alerts-feed' }, alerts.map(alertBanner)) : null,

    snapshot.totalIncome <= 0
      ? h('div', { class: 'card' }, [
        h('div', { class: 'text-strong' }, 'No income set up yet'),
        h('div', { class: 'text-muted small' }, 'Add an income source in Settings and your budget will be calculated automatically.'),
      ])
      : null,

    h('div', { class: 'section-title' }, 'Budget'),
    h('div', { class: 'budget-grid' }, snapshot.groups.map((g) => budgetGroupCard(g, currency, formatMoney))),

    h('div', { class: 'section-title' }, 'Emergency Fund'),
    h('div', { class: 'card link-card', onclick: () => navigate('#/emergency-fund') }, [
      h('div', { class: 'budget-card-head' }, [
        h('span', {}, `${formatMoney(emergencyFund.current, currency)} / ${formatMoney(emergencyFund.target, currency)}`),
        h('span', { class: 'text-muted' }, `${emergencyFund.progressPercent}%`),
      ]),
    ]),

    h('div', { class: 'section-title-row' }, [
      h('span', { class: 'section-title' }, 'Financial Goals'),
      h('a', { href: '#/goals', class: 'text-link' }, 'View all'),
    ]),
    goals.length
      ? h('div', { class: 'goal-list-compact' }, goals.slice(0, 3).map((g) => h('div', { class: 'card link-card', onclick: () => navigate(`#/goals/${g.id}`) }, [
        h('div', { class: 'budget-card-head' }, [h('span', {}, g.title), h('span', { class: 'text-muted' }, `${g.progress.progressPercent}%`)]),
      ])))
      : emptyState('No goals yet. Add one from the Goals tab.'),

    h('div', { class: 'section-title-row' }, [
      h('span', { class: 'section-title' }, 'Recent Expenses'),
      h('a', { href: '#/expenses', class: 'text-link' }, 'View all'),
    ]),
    recentExpenses.length
      ? h('div', { class: 'expense-list' }, recentExpenses.map(expenseRow(currency)))
      : emptyState('No expenses recorded this month yet.'),

    button('Can I afford this?', { variant: 'ghost', className: 'btn-block', onClick: () => navigate('#/can-i-afford') }),
  ]);

  mount(root, content);
}

function expenseRow(currency) {
  return (e) => h('div', { class: 'expense-row' }, [
    h('div', {}, [
      h('div', { class: 'text-strong' }, e.subcategory || e.categoryId),
      h('div', { class: 'text-muted small' }, e.date),
    ]),
    h('span', { class: 'text-strong' }, formatMoney(e.amount, currency)),
  ]);
}
