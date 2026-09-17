import { h, mount, page, button, textInput, field } from './components.js';
import { BUILTIN_RULES, resolveGroups, validateGroupPercentages } from '../engine/rules.js';
import { calculateAllocations } from '../engine/budget.js';
import { formatMoney } from '../engine/currency.js';
import { store } from '../store.js';

export function renderRuleSelect(root, { navigate, onDone }) {
  let selectedId = store.state.ruleId || '50-30-20';
  let pyfMode = 'percent';
  let pyfPercent = 20;
  let pyfFixed = 0;
  let customGroups = [
    { id: 'needs', label: 'Needs', kind: ['needs'], percent: 50 },
    { id: 'wants', label: 'Wants', kind: ['wants'], percent: 30 },
    { id: 'savings', label: 'Savings', kind: ['savings'], percent: 20 },
  ];

  const income = (Number(store.state.profile.monthlySalary) || 0) + (Number(store.state.profile.otherIncome) || 0);

  function currentConfig() {
    if (selectedId === 'pay-yourself-first') {
      return pyfMode === 'fixed' ? { savingsMode: 'fixed', savingsFixedAmount: Number(pyfFixed) || 0 } : { savingsMode: 'percent', savingsPercent: Number(pyfPercent) || 0 };
    }
    if (selectedId === 'custom') return { customGroups };
    return null;
  }

  function render() {
    const rule = BUILTIN_RULES.find((r) => r.id === selectedId);
    const config = currentConfig();
    const currency = store.state.profile.currency;

    const ruleCards = BUILTIN_RULES.map((r) => h('div', {
      class: `rule-card ${r.id === selectedId ? 'rule-card-selected' : ''}`,
      onclick: () => { selectedId = r.id; render(); },
    }, [
      h('div', { class: 'rule-card-name' }, r.name),
      h('div', { class: 'rule-card-tagline text-muted' }, r.tagline),
    ]));

    let editorNodes = [];
    if (selectedId === 'pay-yourself-first') {
      editorNodes = [
        h('div', { class: 'segmented' }, [
          h('button', { type: 'button', class: pyfMode === 'percent' ? 'seg-active' : '', onclick: () => { pyfMode = 'percent'; render(); } }, 'Percent'),
          h('button', { type: 'button', class: pyfMode === 'fixed' ? 'seg-active' : '', onclick: () => { pyfMode = 'fixed'; render(); } }, 'Fixed amount'),
        ]),
        pyfMode === 'percent'
          ? field('Savings percentage', textInput({ type: 'number', min: '0', value: pyfPercent, oninput: (v) => { pyfPercent = v; render(); } }))
          : field('Savings amount', textInput({ type: 'number', min: '0', value: pyfFixed, oninput: (v) => { pyfFixed = v; render(); } })),
      ];
    }
    if (selectedId === 'custom') {
      editorNodes = [
        h('div', { class: 'custom-groups' }, customGroups.map((g, i) => h('div', { class: 'custom-group-row' }, [
          textInput({ value: g.label, oninput: (v) => { customGroups[i].label = v; render(); } }),
          textInput({ type: 'number', min: '0', value: g.percent, oninput: (v) => { customGroups[i].percent = Number(v) || 0; render(); } }),
          h('button', { type: 'button', class: 'icon-btn', onclick: () => { customGroups.splice(i, 1); render(); } }, '✕'),
        ]))),
        button('+ Add category', {
          variant: 'ghost',
          onClick: () => { customGroups.push({ id: `custom_${customGroups.length}`, label: 'New Category', kind: ['wants'], percent: 0 }); render(); },
        }),
        !validateGroupPercentages(customGroups) ? h('div', { class: 'field-error' }, 'Percentages must add up to 100%.') : null,
      ];
    }

    const groups = calculateAllocations(rule, income, config);
    const preview = h('div', { class: 'rule-preview' }, [
      h('div', { class: 'rule-preview-title' }, `Preview at ${formatMoney(income, currency)}/month`),
      ...groups.map((g) => h('div', { class: 'rule-preview-row' }, [
        h('span', {}, g.label),
        h('span', { class: 'text-strong' }, formatMoney(g.allocated, currency)),
      ])),
    ]);

    const canContinue = selectedId !== 'custom' || validateGroupPercentages(customGroups);

    const content = page('Choose Your Budgeting Rule', [
      h('p', { class: 'text-muted' }, 'Budgeting rules are benchmarks, not laws — pick the one that fits how you want to plan, and switch anytime in Settings.'),
      h('div', { class: 'rule-list' }, ruleCards),
      editorNodes.length ? h('div', { class: 'card' }, editorNodes) : null,
      preview,
      button('Confirm & Continue', {
        className: 'btn-block',
        onClick: async () => {
          if (!canContinue) return;
          await store.setRule(selectedId, config);
          if (onDone) onDone(); else navigate('#/home');
        },
      }),
    ]);
    mount(root, content);
  }

  render();
}
