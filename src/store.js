// Central application state: persistence, security (optional PIN lock),
// and all mutating actions. UI modules read derived data through the
// getters here and call actions to mutate state — nothing touches
// localStorage directly outside this file.

import { DEFAULT_CATEGORIES, mergeCategories, resolveKind } from './engine/categories.js';
import { detectCurrency } from './engine/currency.js';
import { monthlyIncomeFor, recurringMonthlyIncome, incomeBreakdown, makeIncomeSource } from './engine/income.js';
import { getRule, BUILTIN_RULES } from './engine/rules.js';
import { computeBudgetSnapshot, previewExpenseImpact, analyzePurchase } from './engine/budget.js';
import { buildAlerts } from './engine/alerts.js';
import { calculateTarget, calculateProgress } from './engine/emergencyFund.js';
import { goalProgress, totalMonthlyGoalContributions } from './engine/goals.js';
import { materializeForMonth, monthKey as monthKeyOf, upcomingReminders } from './engine/recurring.js';
import { buildInsights, categoryTotalsList } from './engine/insights.js';
import { generateMonthlyReport } from './engine/report.js';
import { generateId } from './engine/id.js';
import { encryptWithKey, decryptWithKey, deriveKeyFromPin, randomBytes, bytesToBase64 } from './engine/crypto.js';

const STORAGE_KEY = 'smartbudget:v1:state';
const LOCK_META_KEY = 'smartbudget:v1:lock';

export const SCHEMA_VERSION = 2;

function defaultState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    profile: {
      name: '',
      currency: detectCurrency(),
      existingSavings: 0,
      essentialMonthlyExpenses: 0,
      existingDebt: 0,
      onboardingComplete: false,
    },
    // Any number of income sources, of any type, on any schedule.
    // { id, label, type, amount, frequency, everyMonths, date, paymentDay, active }
    incomeSources: [],
    ruleId: '50-30-20',
    ruleConfig: null,
    customCategories: [],
    expenses: [], // { id, amount, categoryId, categoryKind, subcategory, date, paymentMethod, note, createdAt, isRecurring, recurringId }
    recurring: [], // { id, name, amount, categoryId, categoryKind, subcategory, dayOfMonth, paymentMethod, active, generatedMonths: [] }
    goals: [], // { id, title, targetAmount, currentAmount, monthlyContribution, targetDate, createdAt }
    emergencyFund: { currentAmount: 0, coverageMonths: 6 },
    notificationSettings: {
      budgetApproaching: true,
      budgetExceeded: true,
      recurringReminder: true,
      incomeReminder: true,
      monthlyReport: true,
      savingsProgress: true,
      emergencyFundProgress: true,
      goalProgress: true,
      unusualSpending: true,
    },
  };
}

// Category ids and subcategory names changed when the app moved to
// generic personal-finance categories; expenses keep their own
// categoryKind, so only the labels they point at need remapping.
const LEGACY_CATEGORY_IDS = { savings: 'financial', debt: 'financial' };
const LEGACY_SUBCATEGORIES = {
  Rent: 'Housing', Electricity: 'Utilities', Gas: 'Utilities', Water: 'Utilities',
  Medical: 'Healthcare', 'Phone/Internet': 'Communication', Restaurants: 'Dining out',
  Subscriptions: 'Non-essential subscriptions', 'General Savings': 'Savings',
  Investment: 'Investments', 'Loan Installment': 'Debt Payment', 'Credit Card': 'Debt Payment',
};

function migrateCategoryRef(item) {
  if (LEGACY_CATEGORY_IDS[item.categoryId]) item.categoryId = LEGACY_CATEGORY_IDS[item.categoryId];
  if (LEGACY_SUBCATEGORIES[item.subcategory]) item.subcategory = LEGACY_SUBCATEGORIES[item.subcategory];
}

/**
 * Bring stored data forward to the current schema. v1 held a single
 * salary plus an "other income" figure; v2 holds a list of income sources.
 */
export function migrateState(stored) {
  const state = { ...defaultState(), ...stored };
  state.profile = { ...defaultState().profile, ...(stored.profile || {}) };

  if (!stored.schemaVersion || stored.schemaVersion < 2) {
    const sources = [];
    const salary = Number(state.profile.monthlySalary) || 0;
    const other = Number(state.profile.otherIncome) || 0;
    if (salary > 0) {
      sources.push({
        id: generateId('inc'),
        ...makeIncomeSource({ label: 'Primary income', type: 'Salary', amount: salary, frequency: 'monthly', paymentDay: state.profile.salaryPaymentDate }),
      });
    }
    if (other > 0) {
      sources.push({ id: generateId('inc'), ...makeIncomeSource({ label: 'Other income', type: 'Other', amount: other, frequency: 'monthly' }) });
    }
    state.incomeSources = (stored.incomeSources && stored.incomeSources.length) ? stored.incomeSources : sources;

    for (const expense of state.expenses || []) migrateCategoryRef(expense);
    for (const item of state.recurring || []) migrateCategoryRef(item);

    const notifications = { ...defaultState().notificationSettings, ...(stored.notificationSettings || {}) };
    if ('salaryReminder' in notifications) {
      notifications.incomeReminder = notifications.salaryReminder;
      delete notifications.salaryReminder;
    }
    state.notificationSettings = notifications;
  }

  delete state.profile.monthlySalary;
  delete state.profile.otherIncome;
  delete state.profile.salaryPaymentDate;
  state.schemaVersion = SCHEMA_VERSION;
  return state;
}

class SmartBudgetStore {
  constructor() {
    this.state = null;
    this.listeners = new Set();
    this.sessionKey = null; // in-memory CryptoKey while unlocked, for lock mode
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  notify() {
    for (const fn of this.listeners) fn(this.state);
  }

  // ---------- Boot / lock ----------

  getLockMeta() {
    try {
      const raw = localStorage.getItem(LOCK_META_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  isLockEnabled() {
    const meta = this.getLockMeta();
    return !!(meta && meta.enabled);
  }

  /** Load app state. Returns { needsUnlock: boolean }. If no lock is set,
   * state is loaded immediately and needsUnlock is false. */
  async boot() {
    if (this.isLockEnabled()) {
      return { needsUnlock: true };
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    this.state = raw ? migrateState(JSON.parse(raw)) : defaultState();
    this.notify();
    return { needsUnlock: false };
  }

  async unlock(pin) {
    const meta = this.getLockMeta();
    if (!meta) throw new Error('No lock configured.');
    const key = await deriveKeyFromPin(pin, meta.salt);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      this.state = defaultState();
      this.sessionKey = key;
      this.notify();
      return;
    }
    const envelope = JSON.parse(raw);
    const plaintext = await decryptWithKey(envelope, key); // throws on wrong PIN
    this.state = migrateState(JSON.parse(plaintext));
    this.sessionKey = key;
    this.notify();
  }

  lock() {
    this.sessionKey = null;
    this.state = null;
    this.notify();
  }

  async enableLock(pin) {
    const salt = bytesToBase64(randomBytes(16));
    const key = await deriveKeyFromPin(pin, salt);
    this.sessionKey = key;
    localStorage.setItem(LOCK_META_KEY, JSON.stringify({ enabled: true, salt, autoLockMinutes: 5 }));
    await this.persist();
  }

  async disableLock() {
    localStorage.removeItem(LOCK_META_KEY);
    this.sessionKey = null;
    await this.persist();
  }

  async changePin(newPin) {
    const meta = this.getLockMeta();
    const salt = bytesToBase64(randomBytes(16));
    const key = await deriveKeyFromPin(newPin, salt);
    this.sessionKey = key;
    localStorage.setItem(LOCK_META_KEY, JSON.stringify({ ...meta, salt }));
    await this.persist();
  }

  async persist() {
    const json = JSON.stringify(this.state);
    if (this.isLockEnabled() && this.sessionKey) {
      const envelope = await encryptWithKey(json, this.sessionKey);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    } else {
      localStorage.setItem(STORAGE_KEY, json);
    }
  }

  async commit(mutator) {
    mutator(this.state);
    await this.persist();
    this.notify();
  }

  // ---------- Categories ----------

  get categories() {
    return mergeCategories(DEFAULT_CATEGORIES, this.state.customCategories);
  }

  async addCustomCategory({ label, kind, subcategories }) {
    await this.commit((s) => {
      s.customCategories.push({ id: generateId('cat'), label, kind, subcategories: subcategories || [] });
    });
  }

  // ---------- Profile / onboarding ----------

  async completeOnboarding({ incomeSources, ...profile }) {
    await this.commit((s) => {
      s.profile = { ...s.profile, ...profile, onboardingComplete: true };
      if (incomeSources) {
        s.incomeSources = incomeSources.map((source) => ({ id: generateId('inc'), ...makeIncomeSource(source) }));
      }
    });
  }

  // ---------- Income ----------

  /** The income basis the budget is built from for a given month. */
  monthlyIncome(monthKeyStr = monthKeyOf()) {
    return monthlyIncomeFor(this.state.incomeSources, monthKeyStr);
  }

  get recurringMonthlyIncome() {
    return recurringMonthlyIncome(this.state.incomeSources);
  }

  incomeBreakdown(monthKeyStr = monthKeyOf()) {
    return incomeBreakdown(this.state.incomeSources, monthKeyStr);
  }

  async addIncomeSource(source) {
    await this.commit((s) => {
      s.incomeSources.push({ id: generateId('inc'), ...makeIncomeSource(source) });
    });
  }

  async updateIncomeSource(id, partial) {
    await this.commit((s) => {
      const source = s.incomeSources.find((i) => i.id === id);
      if (source) Object.assign(source, partial);
    });
  }

  async deleteIncomeSource(id) {
    await this.commit((s) => {
      s.incomeSources = s.incomeSources.filter((i) => i.id !== id);
    });
  }

  async updateProfile(partial) {
    await this.commit((s) => {
      s.profile = { ...s.profile, ...partial };
    });
  }

  // ---------- Budgeting rule ----------

  get rule() {
    return getRule(this.state.ruleId) || BUILTIN_RULES[0];
  }

  async setRule(ruleId, config) {
    await this.commit((s) => {
      s.ruleId = ruleId;
      s.ruleConfig = config || null;
    });
  }

  async updateRuleConfig(config) {
    await this.commit((s) => {
      s.ruleConfig = { ...(s.ruleConfig || {}), ...config };
    });
  }

  // ---------- Expenses ----------

  expensesForMonth(monthKeyStr) {
    return this.state.expenses.filter((e) => e.date.slice(0, 7) === monthKeyStr);
  }

  expensesInRange(startDate, endDate) {
    return this.state.expenses.filter((e) => e.date >= startDate && e.date <= endDate);
  }

  async addExpense({ amount, categoryId, subcategory, date, paymentMethod, note }) {
    const categoryKind = resolveKind(this.categories, categoryId, subcategory);
    const expense = {
      id: generateId('exp'),
      amount: Number(amount),
      categoryId,
      categoryKind,
      subcategory,
      date,
      paymentMethod: paymentMethod || 'Cash',
      note: note || '',
      createdAt: new Date().toISOString(),
    };
    await this.commit((s) => {
      s.expenses.push(expense);
    });
    return expense;
  }

  async deleteExpense(id) {
    await this.commit((s) => {
      s.expenses = s.expenses.filter((e) => e.id !== id);
    });
  }

  /** Non-mutating preview used by "Add Expense" (pre-save warning) and the
   * dedicated "Can I Afford This?" screen. */
  previewExpense({ amount, categoryId, subcategory }, monthKeyStr = monthKeyOf()) {
    const categoryKind = resolveKind(this.categories, categoryId, subcategory);
    const snapshot = this.getSnapshot(monthKeyStr);
    return previewExpenseImpact(snapshot, { amount, categoryKind });
  }

  /** The fuller "Can I afford this?" analysis, including how the purchase
   * sits against income left this month and existing savings commitments. */
  analyzePurchase({ amount, categoryId, subcategory }, monthKeyStr = monthKeyOf()) {
    const categoryKind = resolveKind(this.categories, categoryId, subcategory);
    const snapshot = this.getSnapshot(monthKeyStr);
    return analyzePurchase(snapshot, { amount, categoryKind }, {
      monthlyGoalContributions: this.totalMonthlyGoalContributions,
      emergencyFundRemaining: this.getEmergencyFundStatus().remaining,
    });
  }

  // ---------- Recurring expenses ----------

  async addRecurring({ name, amount, categoryId, subcategory, dayOfMonth, paymentMethod }) {
    const categoryKind = resolveKind(this.categories, categoryId, subcategory);
    await this.commit((s) => {
      s.recurring.push({
        id: generateId('rec'), name, amount: Number(amount), categoryId, categoryKind,
        subcategory, dayOfMonth: Number(dayOfMonth), paymentMethod: paymentMethod || 'Auto',
        active: true, generatedMonths: [],
      });
    });
  }

  async updateRecurring(id, partial) {
    await this.commit((s) => {
      const item = s.recurring.find((r) => r.id === id);
      if (item) Object.assign(item, partial);
    });
  }

  async deleteRecurring(id) {
    await this.commit((s) => {
      s.recurring = s.recurring.filter((r) => r.id !== id);
    });
  }

  /** Materialize this month's recurring expenses (idempotent — a recurring
   * item is only generated once per calendar month). Call on app load and
   * whenever the dashboard is viewed. */
  async generateRecurringForCurrentMonth() {
    const key = monthKeyOf();
    const generated = materializeForMonth(this.state.recurring, key);
    if (generated.length === 0) return [];
    await this.commit((s) => {
      for (const g of generated) {
        s.expenses.push({ id: generateId('exp'), note: g.note, ...g });
        const recurringItem = s.recurring.find((r) => r.id === g.recurringId);
        if (recurringItem) recurringItem.generatedMonths.push(key);
      }
    });
    return generated;
  }

  getRecurringReminders() {
    return upcomingReminders(this.state.recurring);
  }

  // ---------- Budget snapshot / alerts ----------

  getSnapshot(monthKeyStr = monthKeyOf()) {
    const expenses = this.expensesForMonth(monthKeyStr);
    const snapshot = computeBudgetSnapshot({
      rule: this.rule,
      income: this.monthlyIncome(monthKeyStr),
      config: this.state.ruleConfig,
      expenses,
    });
    snapshot.categoryTotals = categoryTotalsList(expenses);
    return snapshot;
  }

  getAlerts(monthKeyStr = monthKeyOf()) {
    return buildAlerts(this.getSnapshot(monthKeyStr), this.state.profile.currency);
  }

  // ---------- Emergency fund ----------

  get essentialMonthlyExpenses() {
    if (this.state.profile.essentialMonthlyExpenses > 0) return this.state.profile.essentialMonthlyExpenses;
    const needsGroup = this.getSnapshot().groups.find((g) => g.kind.includes('needs'));
    return needsGroup ? needsGroup.allocated : 0;
  }

  getEmergencyFundStatus() {
    const target = calculateTarget(this.essentialMonthlyExpenses, this.state.emergencyFund.coverageMonths);
    return { ...calculateProgress(this.state.emergencyFund.currentAmount, target), coverageMonths: this.state.emergencyFund.coverageMonths };
  }

  async setEmergencyFundCoverage(months) {
    await this.commit((s) => {
      s.emergencyFund.coverageMonths = Number(months);
    });
  }

  async contributeToEmergencyFund(amount, date = new Date().toISOString().slice(0, 10)) {
    await this.commit((s) => {
      s.emergencyFund.currentAmount = Math.round((s.emergencyFund.currentAmount + Number(amount)) * 100) / 100;
      s.expenses.push({
        id: generateId('exp'), amount: Number(amount), categoryId: 'financial', categoryKind: 'savings',
        subcategory: 'Emergency Fund', date, paymentMethod: 'Transfer', note: 'Emergency fund contribution', createdAt: new Date().toISOString(),
      });
    });
  }

  // ---------- Goals ----------

  getGoalsWithProgress() {
    return this.state.goals.map((g) => ({ ...g, progress: goalProgress(g) }));
  }

  get totalMonthlyGoalContributions() {
    return totalMonthlyGoalContributions(this.state.goals);
  }

  async addGoal({ title, targetAmount, currentAmount, monthlyContribution, targetDate }) {
    await this.commit((s) => {
      s.goals.push({
        id: generateId('goal'), title, targetAmount: Number(targetAmount),
        currentAmount: Number(currentAmount) || 0, monthlyContribution: Number(monthlyContribution) || 0,
        targetDate: targetDate || null,
        createdAt: new Date().toISOString(),
      });
    });
  }

  async updateGoal(id, partial) {
    await this.commit((s) => {
      const goal = s.goals.find((g) => g.id === id);
      if (goal) Object.assign(goal, partial);
    });
  }

  async deleteGoal(id) {
    await this.commit((s) => {
      s.goals = s.goals.filter((g) => g.id !== id);
    });
  }

  async contributeToGoal(id, amount, date = new Date().toISOString().slice(0, 10)) {
    await this.commit((s) => {
      const goal = s.goals.find((g) => g.id === id);
      if (!goal) return;
      goal.currentAmount = Math.round((goal.currentAmount + Number(amount)) * 100) / 100;
      s.expenses.push({
        id: generateId('exp'), amount: Number(amount), categoryId: 'financial', categoryKind: 'savings',
        subcategory: 'Financial Goals', date, paymentMethod: 'Transfer', note: `Goal contribution: ${goal.title}`, createdAt: new Date().toISOString(),
      });
    });
  }

  // ---------- Insights & reports ----------

  getInsights(monthKeyStr = monthKeyOf()) {
    const currentSnapshot = this.getSnapshot(monthKeyStr);
    const previousKey = previousMonthKey(monthKeyStr);
    const previousSnapshot = this.getSnapshot(previousKey);
    return buildInsights({
      currentSnapshot, previousSnapshot,
      currentExpenses: this.expensesForMonth(monthKeyStr),
      previousExpenses: this.expensesForMonth(previousKey),
      emergencyFund: this.getEmergencyFundStatus(),
      currency: this.state.profile.currency,
    });
  }

  getMonthlyReport(monthKeyStr = monthKeyOf()) {
    const snapshot = this.getSnapshot(monthKeyStr);
    const previousSnapshot = this.getSnapshot(previousMonthKey(monthKeyStr));
    const [year, month] = monthKeyStr.split('-').map(Number);
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    return generateMonthlyReport({
      monthLabel, snapshot, previousSnapshot,
      emergencyFundContribution: this.expensesForMonth(monthKeyStr).filter((e) => e.subcategory === 'Emergency Fund').reduce((a, e) => a + e.amount, 0),
      goalContributions: this.expensesForMonth(monthKeyStr).filter((e) => e.note && e.note.startsWith('Goal contribution')).reduce((a, e) => a + e.amount, 0),
    });
  }

  // ---------- Data export / account deletion ----------

  exportData() {
    return JSON.stringify(this.state, null, 2);
  }

  async importData(json) {
    const parsed = migrateState(JSON.parse(json));
    await this.commit((s) => {
      Object.assign(s, defaultState(), parsed);
    });
  }

  async deleteAccount() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LOCK_META_KEY);
    this.sessionKey = null;
    this.state = defaultState();
    this.notify();
  }

  async updateNotificationSettings(partial) {
    await this.commit((s) => {
      s.notificationSettings = { ...s.notificationSettings, ...partial };
    });
  }
}

export function previousMonthKey(key) {
  const [year, month] = key.split('-').map(Number);
  const d = new Date(year, month - 2, 1);
  return monthKeyOf(d);
}

export const store = new SmartBudgetStore();
export { monthKeyOf as currentMonthKey };
