// Amounts of a document as the VAT records need them: the VAT groups
// (category, rate, base, VAT) in euros, with the sign of the document
// (a credit note lowers the tax), the advances already taxed on a final
// invoice taken out, and the share of a payment under the cash scheme
// (§ 68d). Pure decimal-string arithmetic through packages/core/money.
import { add, sub, mul, div, round, cmp, sum, isZero, neg, isNegative } from '../money/index.js';
import { computeTotals } from '../vat/index.js';
import { getLegislation } from '../legislation/index.js';
import { CoreError } from '../errors.js';

const CREDIT_KINDS = ['CREDIT_NOTE', 'RECEIVED_CREDIT_NOTE'];

/** VAT groups in the document currency, from the stored totals or computed. */
export function documentGroups(document) {
  const totals = document.totals && Array.isArray(document.totals.breakdown) ? document.totals : computeTotals(document);
  return (totals.breakdown || []).map(b => ({ category: b.category, rate: b.rate ?? null, base: round(b.base, 2), vat: round(b.vat, 2) }));
}

/** -1 for a credit note entered with positive amounts, else 1. */
export function documentSign(document, groups) {
  if (!CREDIT_KINDS.includes(document.kind)) return 1;
  const net = sum(groups.map(g => g.base));
  return isNegative(net) ? 1 : -1;
}

/**
 * Converts an amount in the document currency to euros by the document's
 * ECB style rate (units of the currency per 1 EUR).
 * @throws CoreError TAX_FX_RATE_MISSING
 */
export function toEur(amount, document) {
  if (!document.currency || document.currency === 'EUR') return round(amount, 2);
  if (!document.fxRate || isZero(document.fxRate)) throw new CoreError('TAX_FX_RATE_MISSING', `document ${document.id} in ${document.currency} has no rate`);
  return round(div(amount, document.fxRate, 10), 2);
}

const groupKey = (g) => `${g.category}|${g.rate ?? ''}`;

/**
 * Takes the groups of the advance tax documents deducted on a final
 * invoice out of its groups: the advance was taxed when it was received
 * (§ 19 ods. 4), the final invoice taxes only the rest. A partial
 * deduction (link amount below the advance) takes out its share.
 * @param {Array} groups  groups of the final invoice (document currency)
 * @param {Array<{groups: Array, gross: string, amount: string|null}>} advances
 */
export function withoutAdvances(groups, advances) {
  const out = groups.map(g => ({ ...g }));
  for (const advance of advances) {
    const share = advance.amount && !isZero(advance.gross) ? div(advance.amount, advance.gross, 10) : '1';
    for (const ag of advance.groups) {
      const key = groupKey(ag);
      let target = out.find(g => groupKey(g) === key);
      if (!target) {
        target = { category: ag.category, rate: ag.rate, base: '0.00', vat: '0.00' };
        out.push(target);
      }
      target.base = round(sub(target.base, mul(ag.base, share)), 2);
      target.vat = round(sub(target.vat, mul(ag.vat, share)), 2);
    }
  }
  return out.filter(g => !(isZero(g.base) && isZero(g.vat)));
}

/**
 * VAT the company computes itself on a self-assessed purchase: the rate on
 * the line when it is set, else the standard rate valid on the date.
 * @returns {{rate: string, vat: string}}
 */
export function selfAssessedVat(base, rate, date, country = 'SK') {
  const used = rate !== null && rate !== undefined && rate !== '' && cmp(rate, '0') > 0
    ? String(rate)
    : getLegislation('vatRates.STANDARD.rate', date, country);
  return { rate: used, vat: round(div(mul(base, used), '100', 10), 2) };
}

/**
 * Splits groups by the payments that fall into a period (cash scheme,
 * § 68d): each payment taxes its share of every group. The share is taken
 * cumulatively (paid up to the end of the payment minus paid before it),
 * so the parts of all payments add up to the group exactly.
 * @param {Array} groups  groups in the document currency
 * @param {string} gross  gross total of the document
 * @param {Array<{id: string, date: string, amount: string}>} payments  sorted by date
 * @param {(date: string) => boolean} inside  true for a date in the period
 * @returns {Array<{payment: object, groups: Array}>}
 */
export function paymentShares(groups, gross, payments, inside) {
  if (isZero(gross)) return [];
  const result = [];
  let paidBefore = '0';
  for (const payment of payments) {
    const paidAfter = add(paidBefore, payment.amount);
    if (inside(payment.date)) {
      const capped = (x) => (cmp(x, gross) > 0 ? gross : x);
      const part = (value) => round(sub(
        round(div(mul(value, capped(paidAfter)), gross, 10), 2),
        round(div(mul(value, capped(paidBefore)), gross, 10), 2)
      ), 2);
      const parts = groups.map(g => ({ ...g, base: part(g.base), vat: part(g.vat) })).filter(g => !(isZero(g.base) && isZero(g.vat)));
      if (parts.length) result.push({ payment, groups: parts });
    }
    paidBefore = paidAfter;
  }
  return result;
}

/** Applies a sign to an amount. */
export function signed(amount, sign) {
  return sign < 0 ? round(neg(amount), 2) : round(amount, 2);
}
