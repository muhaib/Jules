import { h, mount, page, field, textInput, selectInput, button, progressBar, emptyState } from './components.js';
import { formatMoney } from '../engine/currency.js';
import { GOAL_TEMPLATES } from '../engine/goals.js';
import { validateGoalInput } from '../engine/validation.js';
import { store } from '../store.js';

export function renderGoalsView(root, { navigate }) {
  let showForm = false;
  const form = { title: GOAL_TEMPLATES[0], targetAmount: '', currentAmount: '', monthlyContribution: '' };
  let errors = {};

  function render() {
    const currency = store.state.profile.currency;
    const goals = store.getGoalsWithProgress();

    const goalCards = goals.map((g) => h('div', { class: 'card link-card', onclick: () => navigate(`#/goals/${g.id}`) }, [
      h('div', { class: 'budget-card-head' }, [
        h('span', { class: 'text-strong' }, g.title),
        h('span', {}, g.progress.isComplete ? '✅' : `${g.progress.progressPercent}%`),
      ]),
      progressBar(g.progress.progressPercent, g.progress.isComplete ? 'ok' : 'approaching'),
      h('div', { class: 'budget-card-foot' }, [
        h('span', {}, `${formatMoney(g.currentAmount, currency)} / ${formatMoney(g.targetAmount, currency)}`),
        g.progress.monthsToComplete !== null ? h('span', { class: 'text-muted' }, `${g.progress.monthsToComplete} mo left`) : null,
      ]),
    ]));

    const formNode = showForm ? h('div', { class: 'card' }, [
      field('Goal', selectInput({ options: GOAL_TEMPLATES.map((t) => ({ value: t, label: t })), value: form.title, onchange: (v) => (form.title = v) })),
      field('Target amount', textInput({ type: 'number', min: '0', value: form.targetAmount, oninput: (v) => (form.targetAmount = v) }), errors.targetAmount),
      field('Current amount (optional)', textInput({ type: 'number', min: '0', value: form.currentAmount, oninput: (v) => (form.currentAmount = v) })),
      field('Monthly contribution (optional)', textInput({ type: 'number', min: '0', value: form.monthlyContribution, oninput: (v) => (form.monthlyContribution = v) })),
      h('div', { class: 'confirm-dialog-actions' }, [
        button('Cancel', { variant: 'ghost', onClick: () => { showForm = false; render(); } }),
        button('Create Goal', {
          onClick: async () => {
            const validation = validateGoalInput({ title: form.title, targetAmount: form.targetAmount });
            if (!validation.valid) { errors = validation.errors; render(); return; }
            await store.addGoal(form);
            showForm = false;
            render();
          },
        }),
      ]),
    ]) : null;

    mount(root, page('Financial Goals', [
      goals.length ? h('div', { class: 'goal-list' }, goalCards) : emptyState('No goals yet — add your first one below.'),
      formNode,
      !showForm ? button('+ New Goal', { className: 'btn-block', onClick: () => { showForm = true; render(); } }) : null,
    ], { back: () => navigate('#/home') }));
  }

  render();
}

export function renderGoalDetail(root, { navigate, id }) {
  let contribution = '';

  function render() {
    const currency = store.state.profile.currency;
    const goal = store.getGoalsWithProgress().find((g) => g.id === id);
    if (!goal) { navigate('#/goals'); return; }

    mount(root, page(goal.title, [
      h('div', { class: 'card' }, [
        h('div', { class: 'big-stat' }, formatMoney(goal.currentAmount, currency)),
        h('div', { class: 'text-muted' }, `of ${formatMoney(goal.targetAmount, currency)} target`),
        progressBar(goal.progress.progressPercent, goal.progress.isComplete ? 'ok' : 'approaching'),
        h('div', { class: 'budget-card-foot' }, [
          h('span', {}, `${formatMoney(goal.progress.remaining, currency)} remaining`),
          goal.progress.monthsToComplete !== null ? h('span', {}, `Est. completion: ${goal.progress.estimatedCompletionDate} (${goal.progress.monthsToComplete} mo)`) : null,
        ]),
      ]),
      field('Monthly contribution', textInput({ type: 'number', min: '0', value: goal.monthlyContribution, oninput: async (v) => { await store.updateGoal(id, { monthlyContribution: Number(v) || 0 }); } })),
      field('Add contribution now', textInput({ type: 'number', min: '0', value: contribution, oninput: (v) => (contribution = v) })),
      button('Contribute', {
        className: 'btn-block',
        onClick: async () => {
          if (Number(contribution) > 0) {
            await store.contributeToGoal(id, Number(contribution));
            contribution = '';
            render();
          }
        },
      }),
      button('Delete Goal', {
        variant: 'danger', className: 'btn-block',
        onClick: async () => { if (confirm('Delete this goal?')) { await store.deleteGoal(id); navigate('#/goals'); } },
      }),
    ], { back: () => navigate('#/goals') }));
  }

  render();
}
