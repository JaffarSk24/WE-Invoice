// Calendar periods of the reports: the key of the month, quarter or year a
// date falls in, the list of keys between two dates, and the same period
// one year earlier for the comparison with last year. Dates are local
// calendar dates (YYYY-MM-DD) without a time zone.
import { CoreError } from '../errors.js';

export const GRANULARITIES = Object.freeze(['month', 'quarter', 'year']);

const pad = (n) => String(n).padStart(2, '0');

function assertGranularity(granularity) {
  if (!GRANULARITIES.includes(granularity)) throw new CoreError('REPORT_GRANULARITY_INVALID', `unknown granularity ${granularity}`);
  return granularity;
}

/** "2026-03" (month), "2026-Q1" (quarter) or "2026" (year). */
export function periodKey(date, granularity = 'month') {
  assertGranularity(granularity);
  const year = date.slice(0, 4);
  if (granularity === 'year') return year;
  const month = Number(date.slice(5, 7));
  if (granularity === 'quarter') return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  return `${year}-${pad(month)}`;
}

/** Every period key from the period of `from` to the period of `to`, in order. */
export function periodKeys(from, to, granularity = 'month') {
  assertGranularity(granularity);
  if (!from || !to || from > to) return [];
  const keys = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const step = granularity === 'month' ? 1 : granularity === 'quarter' ? 3 : 12;
  if (granularity === 'quarter') month = Math.floor((month - 1) / 3) * 3 + 1;
  if (granularity === 'year') month = 1;
  const last = periodKey(to, granularity);
  for (let guard = 0; guard < 1200; guard++) {
    const key = periodKey(`${year}-${pad(month)}-01`, granularity);
    keys.push(key);
    if (key === last) break;
    month += step;
    while (month > 12) { month -= 12; year += 1; }
  }
  return keys;
}

/** The same period one year earlier: "2026-03" -> "2025-03". */
export function previousYearKey(key) {
  return `${Number(key.slice(0, 4)) - 1}${key.slice(4)}`;
}

/** A date one year earlier; 29 February becomes 28 February. */
export function shiftYear(date, years = -1) {
  if (!date) return date;
  const year = Number(date.slice(0, 4)) + years;
  let rest = date.slice(4);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (rest === '-02-29' && !leap) rest = '-02-28';
  return `${year}${rest}`;
}

/** True when a date lies within the optional bounds (inclusive). */
export function within(date, from, to) {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
