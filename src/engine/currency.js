// Currency handling. Nothing in the app assumes a particular currency or
// country: amounts are formatted through Intl, which knows each currency's
// symbol, separators and decimal conventions (JPY has no minor unit, USD
// has two, and so on). The default is derived from the user's own locale
// and can be changed at any time.

export const CURRENCIES = Object.freeze([
  { code: 'USD', label: 'US Dollar' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'PKR', label: 'Pakistani Rupee' },
  { code: 'INR', label: 'Indian Rupee' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'SAR', label: 'Saudi Riyal' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'AUD', label: 'Australian Dollar' },
  { code: 'NZD', label: 'New Zealand Dollar' },
  { code: 'SGD', label: 'Singapore Dollar' },
  { code: 'MYR', label: 'Malaysian Ringgit' },
  { code: 'IDR', label: 'Indonesian Rupiah' },
  { code: 'BDT', label: 'Bangladeshi Taka' },
  { code: 'LKR', label: 'Sri Lankan Rupee' },
  { code: 'NPR', label: 'Nepalese Rupee' },
  { code: 'CNY', label: 'Chinese Yuan' },
  { code: 'JPY', label: 'Japanese Yen' },
  { code: 'KRW', label: 'South Korean Won' },
  { code: 'CHF', label: 'Swiss Franc' },
  { code: 'SEK', label: 'Swedish Krona' },
  { code: 'NOK', label: 'Norwegian Krone' },
  { code: 'DKK', label: 'Danish Krone' },
  { code: 'PLN', label: 'Polish Zloty' },
  { code: 'CZK', label: 'Czech Koruna' },
  { code: 'TRY', label: 'Turkish Lira' },
  { code: 'RUB', label: 'Russian Ruble' },
  { code: 'ZAR', label: 'South African Rand' },
  { code: 'NGN', label: 'Nigerian Naira' },
  { code: 'KES', label: 'Kenyan Shilling' },
  { code: 'GHS', label: 'Ghanaian Cedi' },
  { code: 'EGP', label: 'Egyptian Pound' },
  { code: 'QAR', label: 'Qatari Riyal' },
  { code: 'KWD', label: 'Kuwaiti Dinar' },
  { code: 'BHD', label: 'Bahraini Dinar' },
  { code: 'OMR', label: 'Omani Rial' },
  { code: 'JOD', label: 'Jordanian Dinar' },
  { code: 'BRL', label: 'Brazilian Real' },
  { code: 'MXN', label: 'Mexican Peso' },
  { code: 'ARS', label: 'Argentine Peso' },
  { code: 'PHP', label: 'Philippine Peso' },
  { code: 'THB', label: 'Thai Baht' },
  { code: 'VND', label: 'Vietnamese Dong' },
]);

// Region → currency for the common cases, used only to pick a sensible
// starting value during onboarding. The user always chooses.
const REGION_CURRENCY = Object.freeze({
  US: 'USD', GB: 'GBP', PK: 'PKR', IN: 'INR', AE: 'AED', SA: 'SAR', CA: 'CAD',
  AU: 'AUD', NZ: 'NZD', SG: 'SGD', MY: 'MYR', ID: 'IDR', BD: 'BDT', LK: 'LKR',
  NP: 'NPR', CN: 'CNY', JP: 'JPY', KR: 'KRW', CH: 'CHF', SE: 'SEK', NO: 'NOK',
  DK: 'DKK', PL: 'PLN', CZ: 'CZK', TR: 'TRY', RU: 'RUB', ZA: 'ZAR', NG: 'NGN',
  KE: 'KES', GH: 'GHS', EG: 'EGP', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
  JO: 'JOD', BR: 'BRL', MX: 'MXN', AR: 'ARS', PH: 'PHP', TH: 'THB', VN: 'VND',
  DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', PT: 'EUR',
  AT: 'EUR', BE: 'EUR', FI: 'EUR', GR: 'EUR',
});

export const FALLBACK_CURRENCY = 'USD';

/** The currency to preselect during onboarding, from the user's locale. */
export function detectCurrency(locale) {
  const tag = locale || (typeof navigator !== 'undefined' ? navigator.language : null) || 'en-US';
  try {
    const region = new Intl.Locale(tag).maximize().region;
    const code = REGION_CURRENCY[region];
    if (code && CURRENCIES.some((c) => c.code === code)) return code;
  } catch {
    // Unparseable locale tag — fall through to the default.
  }
  return FALLBACK_CURRENCY;
}

function activeLocale() {
  return (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
}

/**
 * Format an amount in the given currency. Whole amounts drop the minor
 * unit ($3,000 rather than $3,000.00); fractional amounts use whatever the
 * currency itself defines.
 */
export function formatMoney(amount, code = FALLBACK_CURRENCY, locale) {
  const n = Number(amount) || 0;
  const rounded = Math.round(n * 100) / 100;
  const isWhole = Number.isInteger(rounded);
  try {
    return new Intl.NumberFormat(locale || activeLocale(), {
      style: 'currency',
      currency: code || FALLBACK_CURRENCY,
      ...(isWhole ? { minimumFractionDigits: 0, maximumFractionDigits: 0 } : {}),
    }).format(rounded);
  } catch {
    // Unknown currency code: still show something useful rather than throw.
    return `${code} ${rounded.toLocaleString(locale || activeLocale())}`;
  }
}

/** Just the currency's symbol, e.g. for compact input adornments. */
export function currencySymbol(code, locale) {
  try {
    return new Intl.NumberFormat(locale || activeLocale(), { style: 'currency', currency: code || FALLBACK_CURRENCY })
      .formatToParts(0)
      .filter((p) => p.type === 'currency')
      .map((p) => p.value)
      .join('') || code;
  } catch {
    return code || '';
  }
}

export function currencyLabel(code) {
  const c = CURRENCIES.find((c) => c.code === code);
  return c ? `${c.code} — ${c.label}` : code;
}

export function formatPercent(fraction, digits = 0) {
  const n = Number(fraction) || 0;
  return `${(n * 100).toFixed(digits)}%`;
}
