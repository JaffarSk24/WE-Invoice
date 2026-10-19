// Decimal helpers for the interface: parsing what the user types (both ","
// and "." as decimal separator), comparing and adding amounts for totals,
// and formatting through Intl. Amounts are decimal strings; big.js does
// the arithmetic, never floats. The core money module (WP-CORE) is used
// when it is implemented; until then the same rules run here.
import Big from 'big.js';
// Named imports: a namespace looked up by name would pull the whole core
// into the start-up bundle.
import { add as coreAdd, cmp as coreCmp, formatAmount as coreFormatAmount, parseAmount as coreParseAmount, round as coreRound } from '@we-invoice/core';
import { currentLang } from '../i18n/index.js';
import { localeOf } from '../i18n/languages.js';

// A stub is detected once per function, so totals over 10 000 rows do not
// throw and catch 10 000 times.
const stubs = new Set();
const money = { add: coreAdd, cmp: coreCmp, formatAmount: coreFormatAmount, parseAmount: coreParseAmount, round: coreRound };

function viaCore(name, args, fallback) {
  if (stubs.has(name)) return fallback();
  try {
    return money[name](...args);
  } catch (e) {
    if (e && e.code === 'NOT_IMPLEMENTED') { stubs.add(name); return fallback(); }
    throw e;
  }
}

// "1 234,50", "1234.50", "-12" -> "1234.50"; anything else -> null.
export function parseDecimal(text) {
  return viaCore('parseAmount', [text], () => {
    const raw = String(text ?? '').replace(/\s/g, '').replace(/[€$£]/g, '');
    if (!raw) return null;
    const normalized = raw.replace(',', '.');
    if (!/^-?\d+(\.\d+)?$/.test(normalized) && !/^-?\.\d+$/.test(normalized)) return null;
    try { return new Big(normalized).toString(); } catch (e) { return null; }
  });
}

export function add(a, b) {
  return viaCore('add', [a, b], () => new Big(a || 0).plus(b || 0).toString());
}

export function cmp(a, b) {
  return viaCore('cmp', [a, b], () => new Big(a || 0).cmp(b || 0));
}

export function round(value, places = 2) {
  return viaCore('round', [value, places], () => new Big(value || 0).round(places, Big.roundHalfUp).toFixed(places));
}

export function isNegative(value) {
  return cmp(value, '0') < 0;
}

// Sum of decimal strings; empty or missing values count as zero.
export function sum(values) {
  return values.reduce((acc, v) => add(acc, v || '0'), '0');
}

export function formatAmount(amount, currency = 'EUR', lang = currentLang()) {
  return viaCore('formatAmount', [amount, currency, localeOf(lang)], () => {
    const value = Number(new Big(amount || 0).toFixed(2));
    try {
      return new Intl.NumberFormat(localeOf(lang), { style: 'currency', currency }).format(value);
    } catch (e) {
      return `${new Big(amount || 0).toFixed(2)} ${currency}`;
    }
  });
}

export function formatNumber(value, lang = currentLang(), options = {}) {
  const number = Number(new Big(value || 0).toString());
  return new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: 2, ...options }).format(number);
}

// The decimal string for an input field in the user's language ("12,50").
export function toInputText(value, lang = currentLang()) {
  if (value === null || value === undefined || value === '') return '';
  const text = new Big(value).toString();
  return localeOf(lang).startsWith('en') ? text : text.replace('.', ',');
}
