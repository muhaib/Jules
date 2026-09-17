// Income model. A person's money can come from anywhere — a salary,
// freelance work, a business, part-time work, or something else entirely —
// arriving on all sorts of schedules. Everything is normalized to a
// monthly basis so the budgeting rules can work from a single number
// regardless of how the money actually arrives.

export const INCOME_TYPES = Object.freeze(['Salary', 'Freelance', 'Business', 'Part-time', 'Other']);

export const FREQUENCIES = Object.freeze([
  { id: 'monthly', label: 'Monthly', recurring: true },
  { id: 'weekly', label: 'Weekly', recurring: true },
  { id: 'biweekly', label: 'Every 2 weeks', recurring: true },
  { id: 'yearly', label: 'Yearly', recurring: true },
  { id: 'custom', label: 'Every N months', recurring: true },
  { id: 'one-time', label: 'One-time', recurring: false },
]);

// Average months are 52/12 weeks long, which is what makes weekly and
// biweekly income normalize to more than 4x / 2x the payment.
const WEEKS_PER_MONTH = 52 / 12;

export function isRecurring(frequency) {
  const f = FREQUENCIES.find((f) => f.id === frequency);
  return f ? f.recurring : true;
}

/**
 * What a single source contributes to a typical month. One-time income
 * contributes nothing to the recurring basis — it only counts in the month
 * it was actually received (see oneTimeIncomeForMonth).
 */
export function monthlyEquivalent(source) {
  if (!source || source.active === false) return 0;
  const amount = Math.max(0, Number(source.amount) || 0);
  switch (source.frequency) {
    case 'weekly': return round2(amount * WEEKS_PER_MONTH);
    case 'biweekly': return round2((amount * WEEKS_PER_MONTH) / 2);
    case 'yearly': return round2(amount / 12);
    case 'custom': {
      const everyMonths = Math.max(1, Number(source.everyMonths) || 1);
      return round2(amount / everyMonths);
    }
    case 'one-time': return 0;
    case 'monthly':
    default: return round2(amount);
  }
}

/** Total recurring income for a typical month. */
export function recurringMonthlyIncome(sources) {
  return round2((sources || []).reduce((total, s) => total + monthlyEquivalent(s), 0));
}

/** One-time income actually received during the given 'YYYY-MM' month. */
export function oneTimeIncomeForMonth(sources, monthKey) {
  return round2((sources || [])
    .filter((s) => s.active !== false && s.frequency === 'one-time' && (s.date || '').slice(0, 7) === monthKey)
    .reduce((total, s) => total + Math.max(0, Number(s.amount) || 0), 0));
}

/**
 * The income basis the budget is calculated from for a given month:
 * recurring income plus any one-time income received that month.
 */
export function monthlyIncomeFor(sources, monthKey) {
  return round2(recurringMonthlyIncome(sources) + oneTimeIncomeForMonth(sources, monthKey));
}

/** Per-source monthly contribution, for display in the UI. */
export function incomeBreakdown(sources, monthKey) {
  return (sources || []).map((s) => {
    const oneTime = s.frequency === 'one-time';
    const countsThisMonth = oneTime ? (s.date || '').slice(0, 7) === monthKey : s.active !== false;
    const monthlyAmount = oneTime
      ? (countsThisMonth ? round2(Math.max(0, Number(s.amount) || 0)) : 0)
      : monthlyEquivalent(s);
    return { ...s, monthlyAmount, countsThisMonth };
  });
}

export function makeIncomeSource({ label, type, amount, frequency, everyMonths, date, paymentDay }) {
  return {
    label: label || type || 'Income',
    type: type || 'Other',
    amount: Math.max(0, Number(amount) || 0),
    frequency: frequency || 'monthly',
    everyMonths: frequency === 'custom' ? Math.max(1, Number(everyMonths) || 1) : null,
    date: frequency === 'one-time' ? (date || new Date().toISOString().slice(0, 10)) : null,
    paymentDay: paymentDay ? Math.min(31, Math.max(1, Number(paymentDay))) : null,
    active: true,
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}
