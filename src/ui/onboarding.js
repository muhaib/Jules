import { h, mount, page, field, textInput, selectInput, button } from './components.js';
import { CURRENCIES, currencyLabel, detectCurrency, formatMoney } from '../engine/currency.js';
import { INCOME_TYPES, FREQUENCIES, recurringMonthlyIncome } from '../engine/income.js';
import { validateOnboardingInput } from '../engine/validation.js';
import { store } from '../store.js';

function blankSource(type = 'Salary') {
  return { label: '', type, amount: '', frequency: 'monthly', everyMonths: '1', date: new Date().toISOString().slice(0, 10), paymentDay: '' };
}

export function renderOnboarding(root, { navigate }) {
  const form = {
    name: '',
    currency: detectCurrency(),
    existingSavings: '',
    essentialMonthlyExpenses: '',
    existingDebt: '',
  };
  let incomeSources = [blankSource()];
  let errors = {};

  function incomeSourceCard(source, index) {
    const isOnly = incomeSources.length === 1;
    return h('div', { class: 'card income-source-card' }, [
      h('div', { class: 'budget-card-head' }, [
        h('span', { class: 'text-strong' }, `Income source ${index + 1}`),
        !isOnly ? h('button', { type: 'button', class: 'icon-btn', onclick: () => { incomeSources.splice(index, 1); render(); } }, '✕') : null,
      ]),
      field('Type', selectInput({
        options: INCOME_TYPES.map((t) => ({ value: t, label: t })),
        value: source.type,
        onchange: (v) => { source.type = v; render(); },
      })),
      field('Name (optional)', textInput({ value: source.label, placeholder: source.type, oninput: (v) => (source.label = v) })),
      field('Amount', textInput({ type: 'number', min: '0', value: source.amount, placeholder: '0', oninput: (v) => { source.amount = v; renderSummary(); } })),
      field('How often', selectInput({
        options: FREQUENCIES.map((f) => ({ value: f.id, label: f.label })),
        value: source.frequency,
        onchange: (v) => { source.frequency = v; render(); },
      })),
      source.frequency === 'custom'
        ? field('Months between payments', textInput({ type: 'number', min: '1', value: source.everyMonths, oninput: (v) => { source.everyMonths = v; renderSummary(); } }))
        : null,
      source.frequency === 'one-time'
        ? field('Date received', textInput({ type: 'date', value: source.date, oninput: (v) => (source.date = v) }))
        : field('Usual payment day (optional)', textInput({ type: 'number', min: '1', max: '31', value: source.paymentDay, placeholder: 'Day of month', oninput: (v) => (source.paymentDay = v) })),
    ]);
  }

  // Keeps the running total live while typing without rebuilding (and
  // thus blurring) the input the user is in.
  function renderSummary() {
    const el = root.querySelector('.income-total-value');
    if (el) el.textContent = formatMoney(recurringMonthlyIncome(incomeSources), form.currency);
  }

  function render() {
    const content = h('div', { class: 'onboarding' }, [
      h('div', { class: 'onboarding-intro' }, [
        h('div', { class: 'onboarding-logo' }, '💰'),
        h('h1', {}, 'Welcome to SmartBudget'),
        h('p', { class: 'text-muted' }, 'Know your money. Control your spending. Reach your goals.'),
      ]),

      field('Your name (optional)', textInput({ value: form.name, oninput: (v) => (form.name = v) })),
      field('Currency', selectInput({
        options: CURRENCIES.map((c) => ({ value: c.code, label: currencyLabel(c.code) })),
        value: form.currency,
        onchange: (v) => { form.currency = v; render(); },
      }), errors.currency),

      h('div', { class: 'section-title' }, 'Your Income'),
      h('p', { class: 'text-muted small' }, 'Add every source of money you receive — a job, freelance work, a business, anything. Income that arrives weekly, yearly or on its own schedule is converted to a monthly figure for you.'),
      ...incomeSources.map(incomeSourceCard),
      errors.incomeSources ? h('div', { class: 'field-error' }, errors.incomeSources) : null,
      button('+ Add another income source', { variant: 'ghost', className: 'btn-block', onClick: () => { incomeSources.push(blankSource('Freelance')); render(); } }),
      h('div', { class: 'income-row income-remaining' }, [
        h('span', { class: 'text-strong' }, 'Total monthly income'),
        h('span', { class: 'text-strong income-total-value' }, formatMoney(recurringMonthlyIncome(incomeSources), form.currency)),
      ]),

      h('div', { class: 'section-title' }, 'Optional Details'),
      field('Current savings', textInput({ type: 'number', min: '0', value: form.existingSavings, oninput: (v) => (form.existingSavings = v) })),
      field('Essential monthly expenses', textInput({ type: 'number', min: '0', value: form.essentialMonthlyExpenses, placeholder: 'Used to size your emergency fund target', oninput: (v) => (form.essentialMonthlyExpenses = v) })),
      field('Existing loans / debt', textInput({ type: 'number', min: '0', value: form.existingDebt, oninput: (v) => (form.existingDebt = v) })),

      button('Continue', {
        className: 'btn-block',
        onClick: async () => {
          const validation = validateOnboardingInput({ currency: form.currency, incomeSources });
          if (!validation.valid) {
            errors = validation.errors;
            render();
            return;
          }
          await store.completeOnboarding({
            name: form.name,
            currency: form.currency,
            existingSavings: Number(form.existingSavings) || 0,
            essentialMonthlyExpenses: Number(form.essentialMonthlyExpenses) || 0,
            existingDebt: Number(form.existingDebt) || 0,
            incomeSources: incomeSources
              .filter((s) => Number(s.amount) > 0)
              .map((s) => ({ ...s, label: s.label || s.type })),
          });
          if (Number(form.existingSavings) > 0) {
            await store.commit((s) => { s.emergencyFund.currentAmount = Number(form.existingSavings) || 0; });
          }
          navigate('#/rule-select');
        },
      }),
    ]);
    mount(root, page('', [content]));
  }

  render();
}
