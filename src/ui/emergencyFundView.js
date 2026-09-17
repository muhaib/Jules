import { h, mount, page, field, textInput, selectInput, button, progressBar } from './components.js';
import { formatMoney } from '../engine/currency.js';
import { COVERAGE_PRESETS } from '../engine/emergencyFund.js';
import { store } from '../store.js';

export function renderEmergencyFundView(root, { navigate }) {
  let contribution = '';

  function render() {
    const status = store.getEmergencyFundStatus();
    const currency = store.state.profile.currency;
    const preset = COVERAGE_PRESETS.find((p) => p.months === status.coverageMonths) || COVERAGE_PRESETS[2];

    const content = page('Emergency Fund', [
      h('p', { class: 'text-muted' }, `Target is based on your essential monthly expenses (${formatMoney(store.essentialMonthlyExpenses, currency)}) × your selected coverage window.`),
      h('div', { class: 'card' }, [
        h('div', { class: 'big-stat' }, formatMoney(status.current, currency)),
        h('div', { class: 'text-muted' }, `of ${formatMoney(status.target, currency)} target`),
        progressBar(status.progressPercent, status.isComplete ? 'ok' : 'approaching'),
        h('div', { class: 'text-muted small' }, `${status.progressPercent}% funded`),
        status.isComplete
          ? h('div', { class: 'text-strong' }, '🎉 Target reached!')
          : h('div', { class: 'text-muted small' }, `${formatMoney(status.remaining, currency)} remaining`),
      ]),

      h('div', { class: 'section-title' }, 'Coverage Window'),
      h('div', { class: 'segmented' }, COVERAGE_PRESETS.map((p) => h('button', {
        type: 'button',
        class: preset.id === p.id ? 'seg-active' : '',
        onclick: async () => {
          if (p.id === 'custom') {
            const months = prompt('Custom coverage in months:', String(status.coverageMonths));
            if (months && Number(months) > 0) await store.setEmergencyFundCoverage(Number(months));
          } else {
            await store.setEmergencyFundCoverage(p.months);
          }
          render();
        },
      }, p.label))),

      h('div', { class: 'section-title' }, 'Add Contribution'),
      field('Amount', textInput({ type: 'number', min: '0', value: contribution, oninput: (v) => (contribution = v) })),
      button('Add to Emergency Fund', {
        className: 'btn-block',
        onClick: async () => {
          if (Number(contribution) > 0) {
            await store.contributeToEmergencyFund(Number(contribution));
            contribution = '';
            render();
          }
        },
      }),
    ], { back: () => navigate('#/home') });
    mount(root, content);
  }

  render();
}
