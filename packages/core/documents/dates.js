// Calendar dates for documents (WP-CORE). Storage is UTC, but issue, tax
// and due dates are calendar dates without a time zone, and "today" is the
// local date in Europe/Bratislava: a document issued at 00:30 local time
// on the 1st belongs to the 1st even though UTC still says the 31st.
import { CoreError } from '../errors.js';

export const LOCAL_TIME_ZONE = 'Europe/Bratislava';
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const formatters = new Map();

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  }
  return formatters.get(timeZone);
}

/** Checks a "YYYY-MM-DD" string and returns it, or throws DATE_INVALID. */
export function assertDate(value) {
  const m = DATE.exec(String(value || ''));
  if (!m) throw new CoreError('DATE_INVALID', `expected YYYY-MM-DD, got ${value}`);
  const [, y, mo, d] = m.map(Number);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new CoreError('DATE_INVALID', `no such date: ${value}`);
  }
  return value;
}

/** True for a well-formed calendar date. */
export function isDate(value) {
  try { assertDate(value); return true; } catch { return false; }
}

/**
 * Local calendar date of an instant: "today" for the user. Accepts a Date,
 * an ISO timestamp or epoch milliseconds; defaults to now.
 * @returns {string} YYYY-MM-DD
 */
export function localDate(instant = Date.now(), timeZone = LOCAL_TIME_ZONE) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) throw new CoreError('DATE_INVALID', `not an instant: ${instant}`);
  return formatter(timeZone).format(date);
}

/** Calendar date plus n days (n may be negative). */
export function addDays(ymd, n) {
  assertDate(ymd);
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from one calendar date to another (b minus a). */
export function diffDays(a, b) {
  assertDate(a);
  assertDate(b);
  const toUtc = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((toUtc(b) - toUtc(a)) / 86400000);
}

/** Year and month parts of a calendar date as strings ("2026", "10"). */
export function dateParts(ymd) {
  assertDate(ymd);
  return { year: ymd.slice(0, 4), month: ymd.slice(5, 7), day: ymd.slice(8, 10) };
}
