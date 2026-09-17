import { h, mount, page, field, textInput, selectInput, button } from './components.js';
import { validateExpenseInput } from '../engine/validation.js';
import { formatMoney } from '../engine/currency.js';
import { store } from '../store.js';

const PAYMENT_METHODS = ['Cash', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Mobile Wallet', 'Other'];

export function renderAddExpense(root, { navigate }) {
  const categories = store.categories;
  const form = {
    amount: '',
    categoryId: categories[0]?.id || '',
    subcategory: categories[0]?.subcategories[0] || '',
    date: new Date().toISOString().slice(0, 10),
    paymentMethod: 'Cash',
    note: '',
  };
  let errors = {};
  let confirmState = null; // { preview, groupLabel } when a confirm dialog is showing

  function subcategoriesFor(categoryId) {
    const cat = categories.find((c) => c.id === categoryId);
    return cat ? cat.subcategories : [];
  }

  async function save() {
    const validation = validateExpenseInput(form);
    if (!validation.valid) {
      errors = validation.errors;
      render();
      return;
    }
    const preview = store.previewExpense({ amount: form.amount, categoryId: form.categoryId });
    if (preview.willExceed && !confirmState) {
      confirmState = { preview, groupLabel: preview.group.label };
      render();
      return;
    }
    await store.addExpense(form);
    navigate('#/home');
  }

  function render() {
    const currency = store.state.profile.currency;
    const content = page('Add Expense', [
      field('Amount', textInput({ type: 'number', min: '0', value: form.amount, placeholder: '0', oninput: (v) => (form.amount = v) }), errors.amount),
      field('Category', selectInput({
        options: categories.map((c) => ({ value: c.id, label: c.label })),
        value: form.categoryId,
        onchange: (v) => {
          form.categoryId = v;
          form.subcategory = subcategoriesFor(v)[0] || '';
          render();
        },
      }), errors.categoryId),
      field('Subcategory', selectInput({
        options: subcategoriesFor(form.categoryId).map((s) => ({ value: s, label: s })),
        value: form.subcategory,
        onchange: (v) => (form.subcategory = v),
      }), errors.subcategory),
      field('Date', textInput({ type: 'date', value: form.date, oninput: (v) => (form.date = v) }), errors.date),
      field('Payment method', selectInput({
        options: PAYMENT_METHODS.map((m) => ({ value: m, label: m })),
        value: form.paymentMethod,
        onchange: (v) => (form.paymentMethod = v),
      })),
      field('Note (optional)', textInput({ value: form.note, oninput: (v) => (form.note = v) })),
      confirmState ? confirmDialog(confirmState, currency, {
        onCancel: () => { confirmState = null; render(); },
        onConfirm: async () => { await store.addExpense(form); navigate('#/home'); },
      }) : null,
      button('Save Expense', { className: 'btn-block', onClick: save }),
    ], { back: () => navigate('#/home') });
    mount(root, content);
  }

  render();
}

function confirmDialog({ preview, groupLabel }, currency, { onCancel, onConfirm }) {
  return h('div', { class: 'confirm-dialog' }, [
    h('div', { class: 'confirm-dialog-text' }, `⚠️ This expense will exceed your ${groupLabel} budget by ${formatMoney(preview.exceededBy, currency)}.`),
    h('div', { class: 'confirm-dialog-actions' }, [
      button('Cancel', { variant: 'ghost', onClick: onCancel }),
      button('Add Anyway', { variant: 'danger', onClick: onConfirm }),
    ]),
  ]);
}
