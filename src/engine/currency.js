// Currency list and formatting. PKR is the default per spec; users may
// change it later in Settings.

export const CURRENCIES = Object.freeze([
  { code: 'PKR', symbol: 'Rs.', label: 'Pakistani Rupee' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'GBP', symbol: '£', label: 'British Pound' },
  { code: 'INR', symbol: '₹', label: 'Indian Rupee' },
  { code: 'AED', symbol: 'د.إ', label: 'UAE Dirham' },
  { code: 'SAR', symbol: '﷼', label: 'Saudi Riyal' },
  { code: 'CAD', symbol: 'CA$', label: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', label: 'Australian Dollar' },
]);

export const DEFAULT_CURRENCY = 'PKR';

export function currencySymbol(code) {
  const c = CURRENCIES.find((c) => c.code === code);
  return c ? c.symbol : code || '';
}

export function formatMoney(amount, code = DEFAULT_CURRENCY) {
  const n = Number(amount) || 0;
  const symbol = currencySymbol(code);
  const rounded = Math.round(n * 100) / 100;
  const formatted = rounded.toLocaleString('en-US', {
    minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${formatted}`;
}

export function formatPercent(fraction, digits = 0) {
  const n = Number(fraction) || 0;
  return `${(n * 100).toFixed(digits)}%`;
}
