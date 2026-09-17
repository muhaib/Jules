import { h, mount, page, emptyState, button } from './components.js';
import { formatMoney } from '../engine/currency.js';
import { store, currentMonthKey } from '../store.js';

export function renderExpenses(root, { navigate }) {
  const monthKey = currentMonthKey();
  const currency = store.state.profile.currency;
  const expenses = [...store.expensesForMonth(monthKey)].sort((a, b) => (a.date < b.date ? 1 : -1));

  const rows = expenses.map((e) => h('div', { class: 'card expense-detail-row' }, [
    h('div', {}, [
      h('div', { class: 'text-strong' }, e.subcategory || e.categoryId),
      h('div', { class: 'text-muted small' }, `${e.date} · ${e.paymentMethod}${e.note ? ' · ' + e.note : ''}`),
    ]),
    h('div', { class: 'expense-row-right' }, [
      h('span', { class: 'text-strong' }, formatMoney(e.amount, currency)),
      h('button', { class: 'icon-btn', onclick: async () => { await store.deleteExpense(e.id); render(); } }, '✕'),
    ]),
  ]));

  function render() {
    mount(root, page('This Month\'s Expenses', [
      expenses.length ? h('div', { class: 'expense-list-full' }, rows) : emptyState('No expenses recorded this month yet.'),
      button('+ Add Expense', { className: 'btn-block', onClick: () => navigate('#/add-expense') }),
    ], { back: () => navigate('#/home') }));
  }

  render();
}
