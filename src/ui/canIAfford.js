import { h, mount, page, field, textInput, selectInput, button } from './components.js';
import { formatMoney } from '../engine/currency.js';
import { subcategoryNames } from '../engine/categories.js';
import { store } from '../store.js';

export function renderCanIAfford(root, { navigate }) {
  const categories = store.categories;
  const form = { amount: '', categoryId: categories[0]?.id || '', subcategory: subcategoryNames(categories[0])[0] || '' };
  let result = null;

  function subcategoriesFor(categoryId) {
    return subcategoryNames(categories.find((c) => c.id === categoryId));
  }

  function check() {
    if (!(Number(form.amount) > 0)) { result = null; render(); return; }
    result = store.analyzePurchase({ amount: form.amount, categoryId: form.categoryId, subcategory: form.subcategory });
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
        onchange: (v) => { form.subcategory = v; check(); },
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
  const facts = [
    factRow('Money left this month', formatMoney(result.incomeRemainingBefore, currency)),
    result.group ? factRow(`${result.group.label} budget`, formatMoney(result.budgetAllocated, currency)) : null,
    result.group ? factRow(`Spent on ${result.group.label} so far`, formatMoney(result.budgetSpent, currency)) : null,
    result.group ? factRow(`${result.group.label} budget remaining`, formatMoney(result.budgetRemainingBefore, currency)) : null,
    result.monthlyGoalContributions > 0 ? factRow('Committed to goals this month', formatMoney(result.monthlyGoalContributions, currency)) : null,
    result.emergencyFundRemaining > 0 ? factRow('Emergency fund still to save', formatMoney(result.emergencyFundRemaining, currency)) : null,
  ].filter(Boolean);

  const notes = [];
  if (!result.group) {
    notes.push(h('div', {}, "This category isn't covered by your current budgeting rule, so it won't count against any budget limit."));
  } else if (result.willExceedBudget) {
    notes.push(h('div', { class: 'text-strong' },
      `Your ${result.group.label} budget has ${formatMoney(result.budgetRemainingBefore, currency)} remaining. This purchase would exceed that budget by ${formatMoney(result.exceededBy, currency)}.`));
  } else {
    notes.push(h('div', { class: 'text-strong' },
      `This fits within your ${result.group.label} budget, leaving ${formatMoney(result.budgetRemainingAfter, currency)} in it.`));
  }
  if (result.willExceedIncome) {
    notes.push(h('div', {}, `It would also take you ${formatMoney(Math.abs(result.incomeRemainingAfter), currency)} past the income you have left this month.`));
  } else if (result.cutsIntoCommitments) {
    notes.push(h('div', {}, `After the savings you've committed to your goals this month, this would leave you ${formatMoney(Math.abs(result.uncommittedAfter), currency)} short of those contributions.`));
  }
  notes.push(h('div', { class: 'text-muted small' }, "These are the numbers — the decision is yours."));

  const level = !result.group ? '' : (result.willExceedBudget || result.willExceedIncome ? 'confirm-dialog' : '');
  return h('div', { class: `card ${level}` }, [
    h('div', { class: 'afford-notes' }, notes),
    h('div', { class: 'afford-facts' }, facts),
  ]);
}

function factRow(label, value) {
  return h('div', { class: 'income-row' }, [
    h('span', { class: 'text-muted' }, label),
    h('span', {}, value),
  ]);
}
