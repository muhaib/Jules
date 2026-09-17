import { h, mount, page, field, textInput, selectInput, button, emptyState } from './components.js';
import { formatMoney } from '../engine/currency.js';
import { store } from '../store.js';

export function renderRecurringView(root, { navigate }) {
  let showForm = false;
  const categories = store.categories;
  const form = { name: '', amount: '', categoryId: categories[0]?.id || '', subcategory: categories[0]?.subcategories[0] || '', dayOfMonth: '1', paymentMethod: 'Auto' };

  function subcategoriesFor(categoryId) {
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? cat.subcategories : [];
  }

  function render() {
    const currency = store.state.profile.currency;
    const items = store.state.recurring;

    const rows = items.map((item) => h('div', { class: 'card' }, [
      h('div', { class: 'budget-card-head' }, [
        h('span', { class: 'text-strong' }, item.name),
        h('label', { class: 'toggle' }, [
          h('input', { type: 'checkbox', checked: item.active, onchange: async (e) => { await store.updateRecurring(item.id, { active: e.target.checked }); render(); } }),
        ]),
      ]),
      h('div', { class: 'text-muted small' }, `${formatMoney(item.amount, currency)} · Day ${item.dayOfMonth} of each month · ${item.subcategory}`),
      h('button', { class: 'icon-btn', onclick: async () => { await store.deleteRecurring(item.id); render(); } }, 'Delete'),
    ]));

    const formNode = showForm ? h('div', { class: 'card' }, [
      field('Name', textInput({ value: form.name, oninput: (v) => (form.name = v) })),
      field('Amount', textInput({ type: 'number', min: '0', value: form.amount, oninput: (v) => (form.amount = v) })),
      field('Category', selectInput({
        options: categories.map((c) => ({ value: c.id, label: c.label })),
        value: form.categoryId,
        onchange: (v) => { form.categoryId = v; form.subcategory = subcategoriesFor(v)[0] || ''; render(); },
      })),
      field('Subcategory', selectInput({
        options: subcategoriesFor(form.categoryId).map((s) => ({ value: s, label: s })),
        value: form.subcategory,
        onchange: (v) => (form.subcategory = v),
      })),
      field('Day of month due', textInput({ type: 'number', min: '1', max: '31', value: form.dayOfMonth, oninput: (v) => (form.dayOfMonth = v) })),
      h('div', { class: 'confirm-dialog-actions' }, [
        button('Cancel', { variant: 'ghost', onClick: () => { showForm = false; render(); } }),
        button('Save', {
          onClick: async () => {
            if (!form.name || !(Number(form.amount) > 0)) return;
            await store.addRecurring(form);
            showForm = false;
            render();
          },
        }),
      ]),
    ]) : null;

    mount(root, page('Recurring Expenses', [
      h('p', { class: 'text-muted' }, 'Recurring expenses are automatically added to your budget each month and remind you before they’re due.'),
      items.length ? h('div', {}, rows) : emptyState('No recurring expenses set up yet.'),
      formNode,
      !showForm ? button('+ Add Recurring Expense', { className: 'btn-block', onClick: () => { showForm = true; render(); } }) : null,
    ], { back: () => navigate('#/settings') }));
  }

  render();
}
