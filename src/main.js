import { store, currentMonthKey } from './store.js';
import { h, mount, clear } from './ui/components.js';
import { renderBottomNav, HIDDEN_NAV_ROUTES } from './ui/nav.js';
import { renderOnboarding } from './ui/onboarding.js';
import { renderRuleSelect } from './ui/ruleSelect.js';
import { renderLock } from './ui/lock.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderAddExpense } from './ui/addExpense.js';
import { renderExpenses } from './ui/expenses.js';
import { renderEmergencyFundView } from './ui/emergencyFundView.js';
import { renderGoalsView, renderGoalDetail } from './ui/goalsView.js';
import { renderCanIAfford } from './ui/canIAfford.js';
import { renderAnalyticsView } from './ui/analyticsView.js';
import { renderReportView } from './ui/reportView.js';
import { renderRecurringView } from './ui/recurringView.js';
import { renderSettingsView } from './ui/settingsView.js';
import { notify } from './ui/notifications.js';
import { formatMoney } from './engine/currency.js';

const appRoot = document.getElementById('app');
const contentEl = h('div', { class: 'content' });
const navEl = h('div', {});
appRoot.appendChild(contentEl);
appRoot.appendChild(navEl);

function navigate(path) {
  location.hash = path;
}

const ROUTES = [
  { pattern: /^#\/onboarding$/, render: () => renderOnboarding(contentEl, { navigate }) },
  { pattern: /^#\/rule-select/, render: () => renderRuleSelect(contentEl, { navigate }) },
  { pattern: /^#\/home$/, render: () => renderDashboard(contentEl, { navigate }) },
  { pattern: /^#\/add-expense$/, render: () => renderAddExpense(contentEl, { navigate }) },
  { pattern: /^#\/expenses$/, render: () => renderExpenses(contentEl, { navigate }) },
  { pattern: /^#\/emergency-fund$/, render: () => renderEmergencyFundView(contentEl, { navigate }) },
  { pattern: /^#\/goals$/, render: () => renderGoalsView(contentEl, { navigate }) },
  { pattern: /^#\/goals\/([^/]+)$/, render: (m) => renderGoalDetail(contentEl, { navigate, id: m[1] }) },
  { pattern: /^#\/can-i-afford$/, render: () => renderCanIAfford(contentEl, { navigate }) },
  { pattern: /^#\/analytics$/, render: () => renderAnalyticsView(contentEl, { navigate }) },
  { pattern: /^#\/report$/, render: () => renderReportView(contentEl, { navigate }) },
  { pattern: /^#\/recurring$/, render: () => renderRecurringView(contentEl, { navigate }) },
  { pattern: /^#\/settings$/, render: () => renderSettingsView(contentEl, { navigate }) },
];

function currentRouteBase() {
  return (location.hash || '#/home').split('?')[0];
}

async function router() {
  if (!store.state) return; // still locked, nothing to render
  const hash = currentRouteBase();
  const match = ROUTES.find((r) => r.pattern.test(hash));

  if (!store.state.profile.onboardingComplete && hash !== '#/onboarding' && !hash.startsWith('#/rule-select')) {
    navigate('#/onboarding');
    return;
  }

  if (match) {
    const m = hash.match(match.pattern);
    match.render(m);
  } else {
    navigate('#/home');
    return;
  }

  clear(navEl);
  if (!HIDDEN_NAV_ROUTES.includes(hash)) {
    navEl.appendChild(renderBottomNav(hash));
  }

  await runBackgroundChecks();
}

// ---------- Background notification checks ----------

function seenSet() {
  try { return new Set(JSON.parse(localStorage.getItem('smartbudget:v1:seen') || '[]')); } catch { return new Set(); }
}
function saveSeen(set) {
  localStorage.setItem('smartbudget:v1:seen', JSON.stringify([...set]));
}

async function runBackgroundChecks() {
  if (!store.state.profile.onboardingComplete) return;
  const seen = seenSet();
  let changed = false;
  const currency = store.state.profile.currency;

  for (const alert of store.getAlerts()) {
    const key = `alert:${currentMonthKey()}:${alert.id}`;
    if (!seen.has(key)) {
      notify(store, alert.level === 'danger' ? 'budgetExceeded' : 'budgetApproaching', { icon: alert.icon, message: alert.message });
      seen.add(key);
      changed = true;
    }
  }

  for (const r of store.getRecurringReminders()) {
    const key = `recurring:${r.id}:${r.dueDate}`;
    if (!seen.has(key)) {
      const when = r.daysUntilDue === 0 ? 'today' : `in ${r.daysUntilDue} day(s)`;
      notify(store, 'recurringReminder', { icon: '🔔', message: `${r.name} (${formatMoney(r.amount, currency)}) is due ${when}.` });
      seen.add(key);
      changed = true;
    }
  }

  const salaryDay = store.state.profile.salaryPaymentDate;
  if (salaryDay) {
    const diffDays = salaryDay - new Date().getDate();
    if (diffDays >= 0 && diffDays <= 2) {
      const key = `salary:${currentMonthKey()}`;
      if (!seen.has(key)) {
        notify(store, 'salaryReminder', { icon: '💰', message: `Your salary is expected ${diffDays === 0 ? 'today' : `in ${diffDays} day(s)`}.` });
        seen.add(key);
        changed = true;
      }
    }
  }

  const lastSeenMonth = localStorage.getItem('smartbudget:v1:lastMonth');
  const nowKey = currentMonthKey();
  if (lastSeenMonth && lastSeenMonth !== nowKey) {
    const report = store.getMonthlyReport(lastSeenMonth);
    notify(store, 'monthlyReport', { icon: '📄', message: `Your ${report.monthLabel} financial report is ready.`, title: 'Monthly Report' });
  }
  if (lastSeenMonth !== nowKey) localStorage.setItem('smartbudget:v1:lastMonth', nowKey);

  const ef = store.getEmergencyFundStatus();
  if (ef.isComplete && !seen.has('ef:complete')) {
    notify(store, 'emergencyFundProgress', { icon: '🎉', message: 'Your emergency fund target has been reached!' });
    seen.add('ef:complete');
    changed = true;
  }

  for (const goal of store.getGoalsWithProgress()) {
    if (goal.progress.isComplete) {
      const key = `goal:${goal.id}:complete`;
      if (!seen.has(key)) {
        notify(store, 'goalProgress', { icon: '🎯', message: `You've reached your "${goal.title}" goal!` });
        seen.add(key);
        changed = true;
      }
    }
  }

  for (const insight of store.getInsights()) {
    if (insight.type === 'spending-increase') {
      const key = `insight:${currentMonthKey()}:${insight.message}`;
      if (!seen.has(key)) {
        notify(store, 'unusualSpending', { icon: '📈', message: insight.message });
        seen.add(key);
        changed = true;
      }
    }
  }

  if (changed) saveSeen(seen);
}

// ---------- Boot ----------

async function boot() {
  await store.generateRecurringForCurrentMonth();
  window.addEventListener('hashchange', router);
  store.subscribe(() => router());
  if (!location.hash) location.hash = store.state.profile.onboardingComplete ? '#/home' : '#/onboarding';
  router();
}

async function start() {
  const { needsUnlock } = await store.boot();
  if (needsUnlock) {
    renderLock(contentEl, { onUnlocked: boot });
  } else {
    boot();
  }
}

start();
