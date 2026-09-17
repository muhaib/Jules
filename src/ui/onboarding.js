import { h, mount, page, field, textInput, selectInput, button } from './components.js';
import { CURRENCIES, DEFAULT_CURRENCY } from '../engine/currency.js';
import { validateOnboardingInput } from '../engine/validation.js';
import { store } from '../store.js';

export function renderOnboarding(root, { navigate }) {
  const form = {
    name: '',
    currency: DEFAULT_CURRENCY,
    monthlySalary: '',
    salaryPaymentDate: '1',
    otherIncome: '',
    existingSavings: '',
    essentialMonthlyExpenses: '',
    existingDebt: '',
  };
  let errors = {};

  function renderForm() {
    const content = h('div', { class: 'onboarding' }, [
      h('div', { class: 'onboarding-intro' }, [
        h('div', { class: 'onboarding-logo' }, '💰'),
        h('h1', {}, 'Welcome to SmartBudget'),
        h('p', { class: 'text-muted' }, "Let's set up your income so we can calculate the budget that's right for you."),
      ]),
      field('Your name (optional)', textInput({ value: form.name, oninput: (v) => (form.name = v) })),
      field('Currency', selectInput({
        options: CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.label}` })),
        value: form.currency,
        onchange: (v) => (form.currency = v),
      })),
      field('Monthly salary / income', textInput({ type: 'number', min: '0', value: form.monthlySalary, placeholder: 'e.g. 80000', oninput: (v) => (form.monthlySalary = v) }), errors.monthlySalary),
      field('Salary payment date (day of month)', textInput({ type: 'number', min: '1', value: form.salaryPaymentDate, oninput: (v) => (form.salaryPaymentDate = v) })),
      field('Other income (optional)', textInput({ type: 'number', min: '0', value: form.otherIncome, oninput: (v) => (form.otherIncome = v) })),
      field('Existing savings (optional)', textInput({ type: 'number', min: '0', value: form.existingSavings, oninput: (v) => (form.existingSavings = v) })),
      field('Monthly essential expenses (optional)', textInput({ type: 'number', min: '0', value: form.essentialMonthlyExpenses, placeholder: 'Used to size your Emergency Fund target', oninput: (v) => (form.essentialMonthlyExpenses = v) })),
      field('Existing loans / debt (optional)', textInput({ type: 'number', min: '0', value: form.existingDebt, oninput: (v) => (form.existingDebt = v) })),
      button('Continue', {
        className: 'btn-block',
        onClick: async () => {
          const validation = validateOnboardingInput({ currency: form.currency, monthlySalary: form.monthlySalary });
          if (!validation.valid) {
            errors = validation.errors;
            renderForm();
            return;
          }
          await store.completeOnboarding({
            name: form.name,
            currency: form.currency,
            monthlySalary: Number(form.monthlySalary) || 0,
            salaryPaymentDate: Number(form.salaryPaymentDate) || 1,
            otherIncome: Number(form.otherIncome) || 0,
            existingSavings: Number(form.existingSavings) || 0,
            essentialMonthlyExpenses: Number(form.essentialMonthlyExpenses) || 0,
            existingDebt: Number(form.existingDebt) || 0,
          });
          if (form.existingSavings) {
            await store.commit((s) => { s.emergencyFund.currentAmount = Number(form.existingSavings) || 0; });
          }
          navigate('#/rule-select');
        },
      }),
    ]);
    mount(root, page('', [content]));
  }

  renderForm();
}
