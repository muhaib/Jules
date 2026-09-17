import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney, detectCurrency, currencySymbol, CURRENCIES, FALLBACK_CURRENCY } from '../src/engine/currency.js';

test('formats each currency in its own conventions', () => {
  assert.equal(formatMoney(3000, 'USD', 'en-US'), '$3,000');
  assert.equal(formatMoney(3000, 'GBP', 'en-GB'), '£3,000');
  // Intl separates with a non-breaking space in de-DE, hence the normalize.
  assert.equal(formatMoney(3000, 'EUR', 'de-DE').replace(/ /g, ' '), '3.000 €');
  assert.equal(formatMoney(150000, 'JPY', 'en-US'), '¥150,000');
});

test('shows the minor unit only when the amount has one', () => {
  assert.equal(formatMoney(1234.5, 'USD', 'en-US'), '$1,234.50');
  assert.equal(formatMoney(1234, 'USD', 'en-US'), '$1,234');
});

test('handles zero, negative and huge amounts without breaking', () => {
  assert.equal(formatMoney(0, 'USD', 'en-US'), '$0');
  assert.equal(formatMoney(-250, 'USD', 'en-US'), '-$250');
  assert.equal(formatMoney(1e9, 'USD', 'en-US'), '$1,000,000,000');
  assert.equal(formatMoney(null, 'USD', 'en-US'), '$0');
  assert.equal(formatMoney(undefined, 'USD', 'en-US'), '$0');
});

test('an unknown currency code degrades gracefully instead of throwing', () => {
  assert.doesNotThrow(() => formatMoney(100, 'NOTACODE', 'en-US'));
  assert.match(formatMoney(100, 'NOTACODE', 'en-US'), /100/);
});

test('detects a sensible starting currency from locale, defaulting safely', () => {
  assert.equal(detectCurrency('en-PK'), 'PKR');
  assert.equal(detectCurrency('en-US'), 'USD');
  assert.equal(detectCurrency('de-DE'), 'EUR');
  assert.equal(detectCurrency('ja-JP'), 'JPY');
  assert.equal(detectCurrency('zz-ZZ'), FALLBACK_CURRENCY);
  assert.equal(detectCurrency('not a locale'), FALLBACK_CURRENCY);
});

test('the currency list is broad and has no duplicates', () => {
  const codes = CURRENCIES.map((c) => c.code);
  assert.ok(codes.length >= 20);
  assert.equal(new Set(codes).size, codes.length);
  for (const expected of ['USD', 'EUR', 'GBP', 'PKR', 'INR', 'AED', 'SAR']) {
    assert.ok(codes.includes(expected), `expected ${expected} to be supported`);
  }
});

test('symbols resolve per currency', () => {
  assert.equal(currencySymbol('USD', 'en-US'), '$');
  assert.equal(currencySymbol('EUR', 'de-DE'), '€');
});
