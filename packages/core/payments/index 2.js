// Payments, payment status and late payment interest (WP-CORE). A document
// is paid by the payments recorded on it in its own currency; the amount
// to pay is the payable total (BT-115) less those payments. Interest uses
// the ECB base rate passed in by the caller (the gateway fetches it) and
// the margins from legislation, never constants in code.
import { add, sub, mul, div, round, cmp, sum, isZero } from '../money/index.js';
import { getLegislation } from '../legislation/index.js';
import { diffDays, addDays, localDate } from '../documents/dates.js';
import { computeTotals } from '../vat/index.js';
import { CoreError } from '../errors.js';

const DAYS_IN_YEAR = '365';

/** Payable total of a document: stored totals, else computed. */
export function payableOf(document) {
  const payable = document.totals?.payable ?? computeTotals(document).payable;
  return round(payable, 2);
}

/** Sum of the payments recorded in the document currency. */
export function paidAmount(document) {
  const payments = (document.payments || []).filter(p => !p.deleted && (!p.currency || !document.currency || p.currency === document.currency));
  // Most documents of a list have no payment yet: no arithmetic needed.
  if (!payments.length) return '0.00';
  return round(sum(payments.map(p => p.amount)), 2);
}

/** @returns {'UNPAID'|'PARTIAL'|'PAID'|'OVERPAID'} */
export function paymentState(document) {
  const payable = payableOf(document);
  const paid = paidAmount(document);
  const c = cmp(paid, payable);
  if (c > 0) return 'OVERPAID';
  if (c === 0) return isZero(paid) && !isZero(payable) ? 'UNPAID' : 'PAID';
  return isZero(paid) ? 'UNPAID' : 'PARTIAL';
}

/** Amount still to pay (negative when overpaid). @returns {string} */
export function amountDue(document) {
  return round(sub(payableOf(document), paidAmount(document)), 2);
}

/**
 * Payment status as the list shows it: the payment state, or OVERDUE when
 * something is still due after the due date (by the local calendar date).
 * @returns {'UNPAID'|'PARTIAL'|'PAID'|'OVERPAID'|'OVERDUE'}
 */
export function paymentStatus(document, today = localDate()) {
  const state = paymentState(document);
  if ((state === 'UNPAID' || state === 'PARTIAL') && document.dueDate && document.dueDate < today) return 'OVERDUE';
  return state;
}

/**
 * Úrok z omeškania (03-features.md § 3.10). B2B: ECB base rate plus the
 * margin of nariadenie vlády č. 21/2013 Z. z.; B2C: ECB base rate plus the
 * margin of nariadenie vlády č. 87/1995 Z. z. The ECB rate is the one in
 * force on the first day of the delay and comes from the caller. Interest
 * runs from the day after the due date to `until` inclusive, on a 365 day
 * year. The flat recovery cost of § 369c ObZ is added for B2B on request.
 * @param {{amount: string, dueDate: string, until: string, b2b: boolean, ecbRatePct: string, recoveryCost?: boolean, country?: string}} input
 * @returns {{interest: string, days: number, ratePct: string, recoveryCost: string|null}}
 */
export function lateInterest(input) {
  const { amount, dueDate, until, b2b, ecbRatePct, recoveryCost = false, country = 'SK' } = input || {};
  if (ecbRatePct === undefined || ecbRatePct === null || ecbRatePct === '') {
    throw new CoreError('ECB_RATE_REQUIRED', 'the ECB base rate must be given');
  }
  const days = Math.max(0, diffDays(dueDate, until));
  const firstDay = addDays(dueDate, 1);
  const rule = getLegislation('latePaymentInterest', firstDay, country);
  const ratePct = round(add(ecbRatePct, b2b ? rule.b2bMarginPp : rule.b2cMarginPp), 2);
  const interest = days > 0 ? round(div(mul(mul(amount, ratePct), String(days)), mul('100', DAYS_IN_YEAR), 10), 2) : '0.00';
  const flat = b2b && recoveryCost && days > 0 ? round(getLegislation('recoveryCostFlat.amount', firstDay, country), 2) : null;
  return { interest, days, ratePct, recoveryCost: flat };
}
