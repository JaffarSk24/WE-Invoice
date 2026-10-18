// The VAT registration limit (§ 4 zákona o DPH, vatRegistrationThreshold in
// legislation). Turnover is the net amount of domestic supplies of goods
// and services to Slovak buyers, without exempt supplies (category E),
// intra-EU supplies (K) and exports (G). A non-payer's own invoices carry
// category O (not subject to VAT): they are its turnover and count. From
// 2025 the law looks at the calendar year: over `amount` in the previous
// year means registration, over `immediate` during the year means VAT
// from the supply that crosses it. The specification also asks for the
// last 12 months, so all three sums are returned and the strictest level
// wins. Credit notes lower the turnover.
import { add, mul, div, round, cmp, sum } from '../money/index.js';
import { getLegislation } from '../legislation/index.js';
import { assertDate } from '../documents/dates.js';
import { documentGroups, documentSign, toEur } from './amounts.js';
import { partnerCountry } from './treatment.js';

// An advance tax document is left out: its final invoice carries the whole
// supply, so counting both would count the advance twice.
const KINDS = ['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'SALES_RECEIPT'];
const COUNTED = ['S', 'Z', 'O'];
export const WARNING_SHARE = '0.8';

function turnoverOf(document) {
  const groups = documentGroups(document).filter(g => COUNTED.includes(g.category) || (g.category === 'AE' && partnerCountry(document.buyer) === 'SK'));
  const sign = documentSign(document, documentGroups(document));
  const net = sum(groups.map(g => g.base));
  const eur = toEur(net, document);
  return sign < 0 ? mul(eur, '-1') : eur;
}

function counted(document) {
  if (!document || document.deleted || !KINDS.includes(document.kind)) return false;
  if (document.status === 'DRAFT' || document.status === 'CANCELLED') return false;
  return partnerCountry(document.buyer || {}) === 'SK';
}

/**
 * @param {Array<object>} documents
 * @param {string} date  the day the limit is looked at (today)
 * @returns {{date: string, amount: string, immediate: string|null, rolling12: string, yearToDate: string, previousYear: string, share: string, level: 'OK'|'NEAR'|'OVER'|'IMMEDIATE', problems: Array<string>}}
 */
export function registrationTurnover(documents, date) {
  assertDate(date);
  const limit = getLegislation('vatRegistrationThreshold', date);
  const year = date.slice(0, 4);
  // The day after the same day a year ago (29 February counts from 1 March).
  const [y, m, d] = date.split('-').map(Number);
  const sameDay = Math.min(d, new Date(Date.UTC(y - 1, m, 0)).getUTCDate());
  const rollingFrom = new Date(Date.UTC(y - 1, m - 1, sameDay + 1)).toISOString().slice(0, 10);
  const totals = { rolling12: '0', yearToDate: '0', previousYear: '0' };
  const problems = [];
  for (const document of documents || []) {
    if (!counted(document)) continue;
    const day = document.taxDate || document.issueDate;
    if (!day || day > date) continue;
    let value;
    try {
      value = turnoverOf(document);
    } catch (e) {
      problems.push(e.code || 'UNKNOWN');
      continue;
    }
    if (day >= rollingFrom) totals.rolling12 = add(totals.rolling12, value);
    if (day.slice(0, 4) === year) totals.yearToDate = add(totals.yearToDate, value);
    if (day.slice(0, 4) === String(Number(year) - 1)) totals.previousYear = add(totals.previousYear, value);
  }
  for (const key of Object.keys(totals)) totals[key] = round(totals[key], 2);
  const highest = [totals.rolling12, totals.yearToDate, totals.previousYear].reduce((a, b) => (cmp(a, b) >= 0 ? a : b));
  let level = 'OK';
  if (limit.immediate && cmp(totals.yearToDate, limit.immediate) > 0) level = 'IMMEDIATE';
  else if (cmp(highest, limit.amount) > 0) level = 'OVER';
  else if (cmp(highest, mul(limit.amount, WARNING_SHARE)) >= 0) level = 'NEAR';
  return {
    date,
    amount: limit.amount,
    immediate: limit.immediate || null,
    ...totals,
    share: round(mul(div(highest, limit.amount, 10), '100'), 1),
    level,
    problems: [...new Set(problems)]
  };
}
