// Money arithmetic on decimal strings (WP-CORE). Every amount in the app
// goes through these functions: big.js underneath, never float arithmetic.
// Results are plain decimal strings ("1234.50", never exponent notation),
// so they can be stored as they are and compared as text in tests.
// Rounding is half-up (away from zero) to 2 places unless stated (EN 16931).
import Big from 'big.js';
import { CoreError } from '../errors.js';

// Division precision: enough for unit prices with 4 places and FX rates.
const DIV_PLACES = 10;
const MAX_PLACES = 20;

// Builds a Big from user data, with one error code for everything that is
// not a number (null, "", "abc", NaN, Infinity).
function big(value) {
  if (value instanceof Big) return value;
  if (typeof value === 'number' && !Number.isFinite(value)) throw new CoreError('AMOUNT_INVALID', `not a finite number: ${value}`);
  if (value === null || value === undefined || value === '') throw new CoreError('AMOUNT_INVALID', 'empty amount');
  try {
    return new Big(typeof value === 'string' ? value.trim() : value);
  } catch {
    throw new CoreError('AMOUNT_INVALID', `not a decimal: ${value}`);
  }
}

// Fixed notation without exponent; "-0" becomes "0".
function text(value) {
  const s = value.toFixed();
  return s === '-0' ? '0' : s;
}

function places(n, fallback) {
  if (n === undefined || n === null) return fallback;
  if (!Number.isInteger(n) || n < 0 || n > MAX_PLACES) throw new CoreError('AMOUNT_INVALID', `places out of range: ${n}`);
  return n;
}

/** @param {string|number} a @param {string|number} b @returns {string} */
export function add(a, b) { return text(big(a).plus(big(b))); }
/** @param {string|number} a @param {string|number} b @returns {string} */
export function sub(a, b) { return text(big(a).minus(big(b))); }
/** @param {string|number} a @param {string|number} b @returns {string} */
export function mul(a, b) { return text(big(a).times(big(b))); }

/**
 * Division rounded half-up to `places` (default 10) decimal places.
 * @param {string|number} a @param {string|number} b @param {number} [places] @returns {string}
 */
export function div(a, b, p) {
  const divisor = big(b);
  if (divisor.eq(0)) throw new CoreError('DIVISION_BY_ZERO', 'division by zero');
  return text(big(a).div(divisor).round(places(p, DIV_PLACES), Big.roundHalfUp));
}

/** @param {string|number} a @param {string|number} b @returns {-1|0|1} */
export function cmp(a, b) { return big(a).cmp(big(b)); }

// A decimal string already written with exactly the wanted places, without
// leading zeros and not a negative zero, rounds to itself. Stored amounts
// are such strings, and the reports round tens of thousands of them, so
// they skip big.js; the result is the same string big.js would give.
const SAME_WHEN_ROUNDED = new Map();
function roundsToItself(value, p) {
  if (typeof value !== 'string') return false;
  let re = SAME_WHEN_ROUNDED.get(p);
  if (!re) {
    re = new RegExp(`^-?(0|[1-9]\\d*)${p ? `\\.\\d{${p}}` : ''}$`);
    SAME_WHEN_ROUNDED.set(p, re);
  }
  return re.test(value) && !(value[0] === '-' && /^-[0.]+$/.test(value));
}

/** Half-up rounding (away from zero on a tie). @param {string|number} value @param {number} [places=2] @returns {string} */
export function round(value, p = 2) {
  const n = places(p, 2);
  if (roundsToItself(value, n)) return value;
  return big(value).round(n, Big.roundHalfUp).toFixed(n);
}

/** Sum of a list of amounts, "0" for an empty list. @param {Iterable<string|number>} values @returns {string} */
export function sum(values) {
  let total = new Big(0);
  for (const v of values) total = total.plus(big(v));
  return text(total);
}

/** Sign helpers that read better than cmp(x, 0). */
export function isZero(value) { return big(value).eq(0); }
export function isNegative(value) { return big(value).lt(0); }
export function abs(value) { return text(big(value).abs()); }
export function neg(value) { return text(big(value).neg()); }

/**
 * Cash rounding to the nearest step (0.05 EUR by zakon c. 18/1996 Z. z.,
 * § 3 ods. 4): a remainder below half a step goes down, half a step or more
 * goes up, and an amount of 1 to 4 cents becomes one step. The step itself
 * comes from legislation (cashRounding.step); the default is the Slovak one.
 * @param {string} amount
 * @param {string} [step='0.05']
 * @returns {{amount: string, rounding: string}} rounded amount and the difference (BT-114)
 */
export function roundCash(amount, step = '0.05') {
  const value = big(amount);
  const unit = big(step);
  if (unit.lte(0)) throw new CoreError('AMOUNT_INVALID', `invalid rounding step: ${step}`);
  let rounded = value.div(unit).round(0, Big.roundHalfUp).times(unit);
  if (rounded.eq(0) && !value.eq(0)) rounded = value.gt(0) ? unit : unit.neg();
  const result = rounded.toFixed(2);
  return { amount: result, rounding: text(new Big(result).minus(value)) };
}

/**
 * Display string through Intl. The decimal string is passed to Intl as it
 * is, so large amounts keep every digit.
 * @param {string} amount
 * @param {string} currency  ISO 4217, e.g. "EUR"
 * @param {string} locale  BCP 47, e.g. "sk-SK"
 * @param {{places?: number, currencyDisplay?: string}} [options]
 * @returns {string}
 */
export function formatAmount(amount, currency, locale, options = {}) {
  const value = text(big(amount));
  const p = options.places;
  const formatter = new Intl.NumberFormat(locale || 'sk-SK', {
    style: 'currency',
    currency: currency || 'EUR',
    currencyDisplay: options.currencyDisplay || 'symbol',
    ...(p !== undefined ? { minimumFractionDigits: p, maximumFractionDigits: p } : {})
  });
  return formatter.format(value);
}

/**
 * Parses user input into a decimal string. Accepts "," and "." as the
 * decimal separator, spaces (including non-breaking) and a single currency
 * code or symbol around the number. When both separators appear, the last
 * one is the decimal separator and the other groups thousands; a separator
 * that appears more than once groups thousands.
 * @param {string} input
 * @returns {string|null} null when the text is not an amount
 */
export function parseAmount(input) {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? text(new Big(input)) : null;
  let s = String(input).replace(/[\s\u00a0\u202f']/g, '');
  s = s.replace(/^[^\d,.+-]+|[^\d,.]+$/g, '');
  const m = /^([+-]?)([\d.,]+)$/.exec(s);
  if (!m) return null;
  const [, sign, body] = m;
  const commas = (body.match(/,/g) || []).length;
  const dots = (body.match(/\./g) || []).length;
  // A thousands separator is accepted only between groups of exactly three
  // digits: "1.234.567,50" and "1,234,567.50" are amounts, a typo such as
  // "1,2,3" is refused instead of silently becoming 123.
  const grouped = (integer, sep) => new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(integer);
  let normalized;
  if (commas && dots) {
    const decimal = body.lastIndexOf(',') > body.lastIndexOf('.') ? ',' : '.';
    const grouping = decimal === ',' ? '.' : ',';
    if ((decimal === ',' ? commas : dots) > 1) return null;
    const integer = body.slice(0, body.lastIndexOf(decimal));
    if (!grouped(integer, grouping)) return null;
    normalized = body.split(grouping).join('').replace(decimal, '.');
  } else if (commas > 1) {
    if (!grouped(body, ',')) return null;
    normalized = body.replace(/,/g, '');
  } else if (dots > 1) {
    if (!grouped(body, '.')) return null;
    normalized = body.replace(/\./g, '');
  } else {
    normalized = body.replace(',', '.');
  }
  if (!/^\d*(\.\d*)?$/.test(normalized) || !/\d/.test(normalized)) return null;
  if (normalized.startsWith('.')) normalized = `0${normalized}`;
  if (normalized.endsWith('.')) normalized = normalized.slice(0, -1);
  return text(new Big(`${sign === '-' ? '-' : ''}${normalized}`));
}

/**
 * Converts an amount by a rate: amount x rate, rounded. The rate is the
 * value of one unit of the amount's currency in the target currency.
 * Documents store fxRate the ECB way (units of document currency per
 * 1 EUR), so a document amount in EUR is div(amount, fxRate, 2).
 * @returns {string}
 */
export function convert(amount, rate, p = 2) {
  return big(amount).times(big(rate)).round(places(p, 2), Big.roundHalfUp).toFixed(places(p, 2));
}
