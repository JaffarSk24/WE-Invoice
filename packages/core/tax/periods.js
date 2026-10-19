// Tax periods (05-accounting-tax.md § 5.2, § 5.3). A VAT payer files for a
// calendar month or a calendar quarter (§ 77 zákona o DPH); a period is
// keyed like Document.vatDeductionPeriod: "2026-07" for a month and
// "2026-Q3" for a quarter. Dates are calendar dates without a time zone.
// Filing deadlines come from legislation (deadlines.*Day), never from code.
import { CoreError } from '../errors.js';
import { getLegislation } from '../legislation/index.js';
import { assertDate } from '../documents/dates.js';

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const QUARTER_KEY = /^(\d{4})-Q([1-4])$/;

const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/**
 * Parses a period key.
 * @param {string} key  "2026-07" or "2026-Q3"
 * @returns {{key: string, kind: 'MONTH'|'QUARTER', year: number, month: number|null, quarter: number|null, from: string, to: string}}
 */
export function parsePeriod(key) {
  const text = String(key || '');
  let m = MONTH_KEY.exec(text);
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]);
    return { key: text, kind: 'MONTH', year, month, quarter: null, from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay(year, month))}` };
  }
  m = QUARTER_KEY.exec(text);
  if (m) {
    const year = Number(m[1]);
    const quarter = Number(m[2]);
    const first = (quarter - 1) * 3 + 1;
    return {
      key: text, kind: 'QUARTER', year, month: null, quarter,
      from: `${year}-${pad(first)}-01`, to: `${year}-${pad(first + 2)}-${pad(lastDay(year, first + 2))}`
    };
  }
  throw new CoreError('TAX_PERIOD_INVALID', `expected YYYY-MM or YYYY-Qn, got ${key}`);
}

/** True for a well-formed period key. */
export function isPeriodKey(key) {
  return MONTH_KEY.test(String(key || '')) || QUARTER_KEY.test(String(key || ''));
}

/**
 * The period a calendar date falls in.
 * @param {string} date  YYYY-MM-DD
 * @param {'MONTH'|'QUARTER'} [kind='MONTH']
 */
export function periodOf(date, kind = 'MONTH') {
  assertDate(date);
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  return kind === 'QUARTER' ? `${year}-Q${Math.ceil(month / 3)}` : `${year}-${pad(month)}`;
}

/** True when a date lies inside the period (both ends inclusive). */
export function inPeriod(date, period) {
  if (!date) return false;
  const p = typeof period === 'string' ? parsePeriod(period) : period;
  return date >= p.from && date <= p.to;
}

/** The period kind a company files in: quarterly only when set so (§ 77 ods. 2). */
export function periodKindOf(company) {
  return company && company.vatPeriod === 'QUARTER' ? 'QUARTER' : 'MONTH';
}

/** The period before the given one, of the same kind. */
export function previousPeriod(key) {
  const p = parsePeriod(key);
  if (p.kind === 'MONTH') return p.month === 1 ? `${p.year - 1}-12` : `${p.year}-${pad(p.month - 1)}`;
  return p.quarter === 1 ? `${p.year - 1}-Q4` : `${p.year}-Q${p.quarter - 1}`;
}

/** The period after the given one, of the same kind. */
export function nextPeriod(key) {
  const p = parsePeriod(key);
  if (p.kind === 'MONTH') return p.month === 12 ? `${p.year + 1}-01` : `${p.year}-${pad(p.month + 1)}`;
  return p.quarter === 4 ? `${p.year + 1}-Q1` : `${p.year}-Q${p.quarter + 1}`;
}

/**
 * Months of a period as month keys ("2026-07", "2026-08", "2026-09").
 * @returns {string[]}
 */
export function monthsOf(key) {
  const p = parsePeriod(key);
  if (p.kind === 'MONTH') return [p.key];
  const first = (p.quarter - 1) * 3 + 1;
  return [0, 1, 2].map(i => `${p.year}-${pad(first + i)}`);
}

/** True when the month period lies inside the other period (or equals it). */
export function periodContains(outer, inner) {
  const a = parsePeriod(outer);
  const b = parsePeriod(inner);
  return b.from >= a.from && b.to <= a.to;
}

/**
 * Filing due date of a report for a period: the day from legislation in
 * the month after the period ends; a day past the end of the month moves
 * to its last day. The legal move of a deadline that falls on a weekend
 * or holiday (§ 27 daňového poriadku) is left to the user.
 * @param {string} key
 * @param {'vatReturn'|'kv'|'sv'} report
 * @returns {string} YYYY-MM-DD
 */
export function filingDueDate(key, report, country = 'SK') {
  const p = parsePeriod(key);
  const day = getLegislation(`deadlines.${report}Day`, p.to, country);
  let y = Number(p.to.slice(0, 4));
  let m = Number(p.to.slice(5, 7)) + 1;
  if (m > 12) { m = 1; y += 1; }
  return `${y}-${pad(m)}-${pad(Math.min(day, lastDay(y, m)))}`;
}
