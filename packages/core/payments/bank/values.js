// Values as statements write them: dates in several orders and amounts
// with any separators, signs in front, behind or in brackets. Everything
// becomes a calendar date (YYYY-MM-DD, no time zone) and a decimal string
// with two places, never a float.
import { parseAmount, round, neg, abs } from '../../money/index.js';
import { isDate } from '../../documents/dates.js';

const pad = (n) => String(n).padStart(2, '0');

function key(y, m, d) {
  const year = y < 100 ? 2000 + y : y;
  const k = `${year}-${pad(m)}-${pad(d)}`;
  return isDate(k) ? k : null;
}

/**
 * Calendar date from a statement cell. A time after the date is dropped
 * (statements are kept by day). Dotted and dashed dates are day first;
 * slashed ones follow `order` ('dmy' or 'mdy'); ISO is year first;
 * "YYMMDD" and "DDMMYY" are read by `order` 'ymd6' / 'dmy6'.
 * @returns {string|null}
 */
export function parseStatementDate(value, order = 'dmy') {
  const s = String(value ?? '').trim();
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:$|[T\s])/.exec(s);
  if (m) return key(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2}|\d{4})(?:$|[\s,T])/.exec(s);
  if (m) return key(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})([/-])(\d{1,2})\2(\d{2}|\d{4})(?:$|[\s,T])/.exec(s);
  if (m) return m[2] === '/' && order === 'mdy' ? key(+m[4], +m[1], +m[3]) : key(+m[4], +m[3], +m[1]);
  m = /^(\d{8})$/.exec(s);
  if (m) return key(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8));
  m = /^(\d{6})$/.exec(s);
  if (m && order === 'ymd6') return key(+s.slice(0, 2), +s.slice(2, 4), +s.slice(4, 6));
  if (m && order === 'dmy6') return key(+s.slice(4, 6), +s.slice(2, 4), +s.slice(0, 2));
  return null;
}

/**
 * Signed amount from a statement cell: "-1 234,56", "1.234,56", "(12.50)",
 * "12,50-", a Unicode minus, a currency code around the number.
 * @returns {string|null} decimal string with two places
 */
export function parseStatementAmount(value) {
  let s = String(value ?? '').trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/\u2212/g, '-').replace(/[\s'\u00a0\u202f]/g, '');
  s = s.replace(/^[^\d+\-.,]+/, '').replace(/[^\d.,+-]+$/, '');
  if (/^\d[\d.,]*-$/.test(s)) {
    negative = true;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  const parsed = parseAmount(s);
  if (parsed === null) return null;
  const value2 = round(parsed, 2);
  return negative ? round(neg(value2), 2) : value2;
}

/** Signed amount from a credit / debit indicator and an unsigned amount. */
export function signedAmount(amount, isDebit) {
  const a = round(abs(amount), 2);
  return isDebit ? round(neg(a), 2) : a;
}

/**
 * Day first or month first, from the values themselves: a first number
 * above 12 means day first, a second one above 12 means month first.
 * @returns {'dmy'|'mdy'}
 */
export function detectDateOrder(values) {
  let dmy = false;
  let mdy = false;
  values.forEach(v => {
    const m = /^(\d{1,2})\/(\d{1,2})\/\d{2,4}/.exec(String(v ?? '').trim());
    if (!m) return;
    if (+m[1] > 12) dmy = true;
    if (+m[2] > 12) mdy = true;
  });
  return mdy && !dmy ? 'mdy' : 'dmy';
}
