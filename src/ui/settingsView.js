import { h, mount, page, field, textInput, selectInput, button } from './components.js';
import { CURRENCIES, currencyLabel, formatMoney } from '../engine/currency.js';
import { INCOME_TYPES, FREQUENCIES } from '../engine/income.js';
import { store } from '../store.js';

const NOTIF_LABELS = {
  budgetApproaching: 'Budget approaching limit',
  budgetExceeded: 'Budget exceeded',
  recurringReminder: 'Recurring expense reminders',
  incomeReminder: 'Income reminder',
  monthlyReport: 'Monthly report ready',
  savingsProgress: 'Savings progress',
  emergencyFundProgress: 'Emergency fund progress',
  goalProgress: 'Financial goal progress',
  unusualSpending: 'Unusual spending increase',
};

export function renderSettingsView(root, { navigate }) {
  function render() {
    const profile = store.state.profile;
    const locked = store.isLockEnabled();

    const content = page('Settings', [
      h('div', { class: 'section-title' }, 'Profile'),
      h('div', { class: 'card' }, [
        field('Name', textInput({ value: profile.name, oninput: async (v) => { await store.updateProfile({ name: v }); } })),
        field('Currency', selectInput({
          options: CURRENCIES.map((c) => ({ value: c.code, label: currencyLabel(c.code) })),
          value: profile.currency,
          onchange: async (v) => { await store.updateProfile({ currency: v }); render(); },
        })),
        field('Monthly essential expenses', textInput({ type: 'number', min: '0', value: profile.essentialMonthlyExpenses, oninput: async (v) => { await store.updateProfile({ essentialMonthlyExpenses: Number(v) || 0 }); render(); } })),
      ]),

      h('div', { class: 'section-title-row' }, [
        h('span', { class: 'section-title' }, 'Income Sources'),
        h('span', { class: 'text-muted small' }, `${formatMoney(store.recurringMonthlyIncome, profile.currency)}/mo`),
      ]),
      ...store.incomeBreakdown().map((source) => h('div', { class: 'card' }, [
        h('div', { class: 'budget-card-head' }, [
          h('span', { class: 'text-strong' }, source.label || source.type),
          h('button', {
            class: 'icon-btn',
            onclick: async () => { if (confirm(`Remove "${source.label || source.type}"?`)) { await store.deleteIncomeSource(source.id); render(); } },
          }, 'Remove'),
        ]),
        field('Type', selectInput({
          options: INCOME_TYPES.map((t) => ({ value: t, label: t })),
          value: source.type,
          onchange: async (v) => { await store.updateIncomeSource(source.id, { type: v }); render(); },
        })),
        field('Amount', textInput({ type: 'number', min: '0', value: source.amount, oninput: async (v) => { await store.updateIncomeSource(source.id, { amount: Math.max(0, Number(v) || 0) }); } })),
        field('How often', selectInput({
          options: FREQUENCIES.map((f) => ({ value: f.id, label: f.label })),
          value: source.frequency,
          onchange: async (v) => { await store.updateIncomeSource(source.id, { frequency: v }); render(); },
        })),
        source.frequency === 'custom'
          ? field('Months between payments', textInput({ type: 'number', min: '1', value: source.everyMonths || 1, oninput: async (v) => { await store.updateIncomeSource(source.id, { everyMonths: Math.max(1, Number(v) || 1) }); } }))
          : null,
        source.frequency === 'one-time'
          ? field('Date received', textInput({ type: 'date', value: source.date || '', oninput: async (v) => { await store.updateIncomeSource(source.id, { date: v }); render(); } }))
          : null,
        h('div', { class: 'text-muted small' }, source.frequency === 'monthly'
          ? 'Counts in full every month.'
          : `Counts as ${formatMoney(source.monthlyAmount, profile.currency)} toward this month's budget.`),
      ])),
      button('+ Add Income Source', {
        variant: 'ghost', className: 'btn-block',
        onClick: async () => { await store.addIncomeSource({ label: '', type: 'Other', amount: 0, frequency: 'monthly' }); render(); },
      }),

      h('div', { class: 'section-title' }, 'Budgeting'),
      h('div', { class: 'card link-card', onclick: () => navigate('#/rule-select?from=settings') }, `Current rule: ${store.rule.name} →`),
      h('div', { class: 'card link-card', onclick: () => navigate('#/recurring') }, 'Recurring Expenses →'),

      h('div', { class: 'section-title' }, 'Notifications'),
      h('div', { class: 'card' }, Object.entries(NOTIF_LABELS).map(([key, label]) => h('label', { class: 'toggle-row' }, [
        h('span', {}, label),
        h('input', {
          type: 'checkbox',
          checked: store.state.notificationSettings[key],
          onchange: async (e) => { await store.updateNotificationSettings({ [key]: e.target.checked }); },
        }),
      ]))),
      h('button', {
        class: 'btn btn-ghost btn-block',
        onclick: async () => {
          const mod = await import('./notifications.js');
          const perm = await mod.requestBrowserPermission();
          alert(perm === 'granted' ? 'Browser notifications enabled.' : 'Browser notifications were not enabled: ' + perm);
        },
      }, 'Enable Browser Notifications'),

      h('div', { class: 'section-title' }, 'Security'),
      h('div', { class: 'card' }, [
        h('p', { class: 'text-muted small' }, 'SmartBudget stores everything on this device — nothing is sent to a server. An optional PIN encrypts your data at rest and locks the app.'),
        locked
          ? button('Remove PIN Lock', { variant: 'danger', className: 'btn-block', onClick: async () => { await store.disableLock(); render(); } })
          : button('Set Up PIN Lock', { className: 'btn-block', onClick: async () => {
            const pin = prompt('Choose a PIN (4+ digits):');
            if (pin && pin.length >= 4) { await store.enableLock(pin); render(); }
          } }),
      ]),

      h('div', { class: 'section-title' }, 'Your Data'),
      h('div', { class: 'card' }, [
        button('Export Data (JSON)', { variant: 'ghost', className: 'btn-block', onClick: exportData }),
        h('input', { type: 'file', accept: 'application/json', id: 'import-file', style: 'display:none', onchange: importData }),
        button('Import Data', { variant: 'ghost', className: 'btn-block', onClick: () => document.getElementById('import-file').click() }),
        button('Delete Account & All Data', {
          variant: 'danger', className: 'btn-block',
          onClick: async () => {
            if (confirm('This permanently deletes all your SmartBudget data from this device. Continue?')) {
              await store.deleteAccount();
              navigate('#/onboarding');
            }
          },
        }),
      ]),
    ], { back: () => navigate('#/home') });
    mount(root, content);
  }

  function exportData() {
    const blob = new Blob([store.exportData()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'smartbudget-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      await store.importData(text);
      render();
      alert('Data imported successfully.');
    } catch {
      alert('Could not import this file — it may not be a valid SmartBudget export.');
    }
  }

  render();
}
