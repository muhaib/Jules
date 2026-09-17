// Notification delivery: in-app toasts always show; browser push
// notifications are sent additionally when permission has been granted.
// Each call is gated by the matching notificationSettings toggle so users
// can turn individual notification types on/off (spec section 16).

let container = null;

function ensureContainer() {
  if (container) return container;
  container = document.createElement('div');
  container.className = 'toast-stack';
  document.body.appendChild(container);
  return container;
}

export function showToast({ icon = 'ℹ️', message, level = 'info', timeout = 5000 }) {
  const stack = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast-${level}`;
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message"></span>`;
  toast.querySelector('.toast-message').textContent = message;
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, timeout);
}

export async function requestBrowserPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') return Notification.permission;
  return Notification.requestPermission();
}

export function sendBrowserNotification(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    new Notification(title, options);
  } catch {
    // Some environments (e.g. no service worker) can reject direct
    // construction; failing silently keeps in-app toasts as the fallback.
  }
}

const SETTING_KEY_BY_TYPE = {
  budgetApproaching: 'budgetApproaching',
  budgetExceeded: 'budgetExceeded',
  recurringReminder: 'recurringReminder',
  salaryReminder: 'salaryReminder',
  monthlyReport: 'monthlyReport',
  savingsProgress: 'savingsProgress',
  emergencyFundProgress: 'emergencyFundProgress',
  goalProgress: 'goalProgress',
  unusualSpending: 'unusualSpending',
};

export function notify(store, type, { icon, message, level, title }) {
  const key = SETTING_KEY_BY_TYPE[type];
  if (key && store.state.notificationSettings[key] === false) return;
  showToast({ icon, message, level });
  sendBrowserNotification(title || 'SmartBudget', { body: message, icon: undefined, tag: type });
}
