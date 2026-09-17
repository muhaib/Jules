// Recurring expenses: fixed monthly obligations (rent, utilities,
// subscriptions, loan installments...) that should automatically count
// against the budget each month, plus due-date reminders.

export function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Turn each active recurring definition into a concrete expense for the
 * given month, skipping ones already generated for that month (tracked via
 * recurring.generatedMonths, maintained by the store).
 */
export function materializeForMonth(recurringItems, yearMonth) {
  const generated = [];
  for (const item of recurringItems) {
    if (!item.active) continue;
    if ((item.generatedMonths || []).includes(yearMonth)) continue;
    const [year, month] = yearMonth.split('-').map(Number);
    const day = Math.min(item.dayOfMonth || 1, daysInMonth(year, month));
    generated.push({
      recurringId: item.id,
      amount: item.amount,
      categoryId: item.categoryId,
      categoryKind: item.categoryKind,
      subcategory: item.subcategory,
      date: `${yearMonth}-${String(day).padStart(2, '0')}`,
      paymentMethod: item.paymentMethod || 'Auto',
      note: `Recurring: ${item.name}`,
      isRecurring: true,
    });
  }
  return generated;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Recurring items due within `withinDays` of `today`, for reminder
 * notifications ("Send reminders before the due date").
 */
export function upcomingReminders(recurringItems, today = new Date(), withinDays = 3) {
  const reminders = [];
  const todayStripped = stripTime(today);

  for (const item of recurringItems) {
    if (!item.active) continue;

    let dueDate = dueDateInMonth(item, todayStripped.getFullYear(), todayStripped.getMonth() + 1);
    if (dueDate < todayStripped) {
      const nextMonth = todayStripped.getMonth() + 2;
      const year = todayStripped.getFullYear() + (nextMonth > 12 ? 1 : 0);
      const month = nextMonth > 12 ? nextMonth - 12 : nextMonth;
      dueDate = dueDateInMonth(item, year, month);
    }

    const diffDays = Math.round((dueDate - todayStripped) / 86400000);
    if (diffDays >= 0 && diffDays <= withinDays) {
      reminders.push({ id: item.id, name: item.name, amount: item.amount, dueDate: dueDate.toISOString().slice(0, 10), daysUntilDue: diffDays });
    }
  }
  return reminders;
}

function dueDateInMonth(item, year, month) {
  const day = Math.min(item.dayOfMonth || 1, daysInMonth(year, month));
  return new Date(year, month - 1, day);
}

function stripTime(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
