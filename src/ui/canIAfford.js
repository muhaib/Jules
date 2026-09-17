import { h, mount, page, field, textInput, selectInput, button } from './components.js';
import { formatMoney } from '../engine/currency.js';
import { store } from '../store.js';

export function renderCanIAfford(root, { navigate }) {
  const categories = store.categories;
  const form = { amount: '', categoryId: categories[0]?.id || '', subcategory: categories[0]?.subcategories[0] || '' };
  let result = null;

  function subcategoriesFor(categoryId) {
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? cat.subcategories : [];
  }

  function check() {
    if (!(Number(form.amount) > 0)) { result = null; render(); return; }
    result = store.previewExpense({ amount: form.amount, categoryId: form.categoryId });
    render();
  }

  function render() {
    const currency = store.state.profile.currency;
    const content = page('Can I Afford This?', [
      h('p', { class: 'text-muted' }, 'Check a planned purchase against your current budget. This is information, not a decision — the app never blocks you from spending.'),
      field('Planned amount', textInput({ type: 'number', min: '0', value: form.amount, oninput: (v) => { form.amount = v; check(); } })),
      field('Category', selectInput({
        options: categories.map((c) => ({ value: c.id, label: c.label })),
        value: form.categoryId,
        onchange: (v) => { form.categoryId = v; form.subcategory = subcategoriesFor(v)[0] || ''; check(); },
      })),
      field('Subcategory', selectInput({
        options: subcategoriesFor(form.categoryId).map((s) => ({ value: s, label: s })),
        value: form.subcategory,
        onchange: (v) => (form.subcategory = v),
      })),
      result ? resultCard(result, currency) : null,
      button('Add This Expense', {
        className: 'btn-block',
        onClick: () => navigate('#/add-expense'),
      }),
    ], { back: () => navigate('#/home') });
    mount(root, content);
  }

  render();
}

function resultCard(result, currency) {
  if (!result.group) {
    return h('div', { class: 'card' }, "This category isn't covered by your current budgeting rule, so it won't count against any limit.");
  }
  if (result.willExceed) {
    return h('div', { class: 'card confirm-dialog' }, [
      h('div', {}, `⚠️ This purchase will exceed your ${result.group.label} budget by ${formatMoney(result.exceededBy, currency)}.`),
      h('div', { class: 'text-muted small' }, `${result.group.label}: ${formatMoney(result.group.spent, currency)} spent of ${formatMoney(result.group.allocated, currency)} so far.`),
    ]);
  }
  return h('div', { class: 'card' }, [
    h('div', { class: 'text-strong' }, `🟢 This fits within your ${result.group.label} budget.`),
    h('div', { class: 'text-muted small' }, `${formatMoney(result.newRemaining, currency)} would remain after this purchase.`),
  ]);
}
