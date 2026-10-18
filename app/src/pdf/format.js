// Formatting for the printed document: dates, amounts, quantities and
// rates in the print language, through Intl. Amounts stay decimal strings
// all the way (Intl formats a string exactly), no float arithmetic. Every
// non-breaking space Intl inserts becomes a plain space, so the text layer
// of the PDF and the snapshot tests contain only ordinary characters.
import { localeOf } from '../i18n/languages.js';

// Built from codes so this file holds no non-breaking space itself.
const SPACES = new RegExp(`[${String.fromCharCode(0xa0)}${String.fromCharCode(0x202f)}]`, 'g');
const plain = (text) => String(text).replace(SPACES, ' ');

function dateParts(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

function decimalPlaces(text) {
  const i = text.indexOf('.');
  return i < 0 ? 0 : text.length - i - 1;
}

// Intl accepts a decimal string in current engines; an engine that does not
// falls back to Number for the display only (the stored value is untouched).
function formatDecimal(nf, text) {
  try {
    return nf.format(text);
  } catch {
    return nf.format(Number(text));
  }
}

/** @returns {{date: Function, amount: Function, money: Function, number: Function, qty: Function, percent: Function, rate: Function}} */
export function formatters(language) {
  const locale = localeOf(language);
  const dateFormat = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  const numbers = new Map();
  const numberFormat = (min, max) => {
    const key = `${min}:${max}`;
    if (!numbers.has(key)) numbers.set(key, new Intl.NumberFormat(locale, { minimumFractionDigits: min, maximumFractionDigits: max }));
    return numbers.get(key);
  };
  const percentSpace = language === 'en' ? '' : ' ';

  // A calendar date (YYYY-MM-DD) without any time zone shift.
  const date = (iso) => {
    const p = dateParts(iso);
    if (!p) return '';
    return plain(dateFormat.format(new Date(Date.UTC(p.y, p.m - 1, p.d))));
  };
  // "1 234,56" with exactly two places.
  const amount = (value) => (value === null || value === undefined || value === '' ? '' : plain(formatDecimal(numberFormat(2, 2), String(value))));
  // "1 234,56 EUR": the ISO code after the number in every language, so a
  // bilingual document reads the same way in both.
  const money = (value, currency) => (amount(value) ? `${amount(value)} ${currency || ''}`.trim() : '');
  // Up to `max` places, trailing zeros dropped (quantities, rates).
  const number = (value, max = 4) => {
    if (value === null || value === undefined || value === '') return '';
    const text = String(value);
    return plain(formatDecimal(numberFormat(0, Math.min(max, Math.max(0, decimalPlaces(text)))), text));
  };
  const qty = (value) => number(value, 4);
  const percent = (value) => (value === null || value === undefined || value === '' ? '' : `${number(value, 2)}${percentSpace}%`);
  // "1 EUR = 25,20 CZK"
  const rate = (fxRate, from, to) => `1 ${from} = ${number(fxRate, 6)} ${to}`;
  return { locale, date, amount, money, number, qty, percent, rate };
}
