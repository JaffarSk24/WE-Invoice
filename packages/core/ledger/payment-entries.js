// Ledger entries made from payments (05-accounting-tax.md § 5.4.2): the
// cash principle of jednoduché účtovníctvo books an income or an expense
// on the day money moves, not on the day of the invoice. A payment of an
// issued document becomes income, a payment of a received one an expense,
// split over the categories of the document lines in proportion to their
// totals. A VAT payer keeps VAT in its own column, so the entry carries
// the VAT share of the payment; for anyone else the whole amount counts.
import { add, sub, mul, div, round, cmp, sum, abs, neg, isZero } from '../money/index.js';
import { computeTotals } from '../vat/index.js';
import { CoreError } from '../errors.js';
import { LEDGER_CATEGORIES, lineCategory, isTaxCategory } from './categories.js';

const INCOME_KINDS = ['INVOICE', 'PROFORMA', 'ADVANCE_TAX_DOC', 'CREDIT_NOTE', 'DEBIT_NOTE', 'SELF_BILLING', 'SALES_RECEIPT'];
const EXPENSE_KINDS = ['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT'];
const CREDIT_KINDS = ['CREDIT_NOTE', 'RECEIVED_CREDIT_NOTE'];

/** INCOME or EXPENSE for a document kind whose payments are booked, else null. */
export function paymentDirection(document) {
  if (EXPENSE_KINDS.includes(document.kind)) return 'EXPENSE';
  if (!INCOME_KINDS.includes(document.kind)) return null;
  // The tax document to a paid proforma repeats a payment already booked
  // on the proforma itself.
  if (document.kind === 'ADVANCE_TAX_DOC' && (document.links || []).some(l => l.kind === 'FROM_PROFORMA')) return null;
  return 'INCOME';
}

/** CASH or BANK for a payment method; null for a set-off (no money moves). */
export function paymentMedium(method) {
  if (method === 'OFFSET') return null;
  return method === 'CASH' ? 'CASH' : 'BANK';
}

/** Splits a total over weights so the parts add up to it exactly (cents). */
export function allocate(total, weights) {
  const all = sum(weights.map(w => abs(w)));
  if (!weights.length) return [];
  if (isZero(all)) return weights.map((_, i) => (i === 0 ? round(total, 2) : '0.00'));
  const parts = weights.map(w => round(div(mul(total, abs(w)), all, 10), 2));
  const rest = sub(round(total, 2), sum(parts));
  if (!isZero(rest)) {
    let biggest = 0;
    parts.forEach((p, i) => { if (cmp(abs(p), abs(parts[biggest])) > 0) biggest = i; });
    parts[biggest] = round(add(parts[biggest], rest), 2);
  }
  return parts;
}

// Gross and VAT per category of the document lines.
function categoryWeights(document, direction) {
  const totals = computeTotals(document);
  const byCategory = new Map();
  const items = (document.lines || []).filter(l => !l.kind || l.kind === 'ITEM');
  totals.lines.forEach((amounts, i) => {
    const category = lineCategory(items[i], direction);
    const current = byCategory.get(category) || { gross: '0', vat: '0' };
    byCategory.set(category, { gross: add(current.gross, amounts.total), vat: add(current.vat, amounts.vat) });
  });
  if (!byCategory.size) byCategory.set(lineCategory(null, direction), { gross: '1', vat: '0' });
  return { totals, groups: [...byCategory.entries()] };
}

// A document amount in EUR: documents keep fxRate as units per 1 EUR.
function toEur(amount, document) {
  if (!document.currency || document.currency === 'EUR') return round(amount, 2);
  if (!document.fxRate) throw new CoreError('LEDGER_FX_RATE_MISSING', `document ${document.id} in ${document.currency} has no rate`, { docId: document.id });
  return round(div(amount, document.fxRate, 10), 2);
}

/** Stable id of an automatic entry, so two devices create the same record. */
export function entryId(paymentId, category) {
  return `le:${paymentId}:${LEDGER_CATEGORIES.indexOf(category)}`;
}

/**
 * Ledger entries that a payment creates (fields of LedgerEntry without the
 * stored base fields). Empty for documents whose payments are not booked
 * and for a set-off.
 * @param {object} document  the paid document
 * @param {object} payment  one of document.payments
 * @param {object} company  the company (vatMode)
 * @returns {object[]}
 */
export function entriesForPayment(document, payment, company) {
  if (!document || !payment || payment.deleted) return [];
  const direction = paymentDirection(document);
  const medium = paymentMedium(payment.method);
  if (!direction || !medium) return [];
  const { totals, groups } = categoryWeights(document, direction);
  let amount = toEur(payment.amount, document);
  const payable = totals.payable;
  if (CREDIT_KINDS.includes(document.kind) && cmp(amount, '0') > 0 && cmp(payable, '0') >= 0) amount = neg(amount);
  const payer = company?.vatMode === 'PAYER';
  // VAT share of this payment: document VAT times paid / payable.
  const vatTotal = payer && !isZero(payable) ? round(div(mul(abs(toEur(totals.vat, document)), abs(payment.amount)), abs(payable), 10), 2) : null;
  const signedVat = vatTotal === null ? null : (cmp(amount, '0') < 0 ? neg(vatTotal) : vatTotal);
  const grossParts = allocate(amount, groups.map(([, g]) => g.gross));
  const vatParts = signedVat === null ? null : allocate(signedVat, groups.map(([, g]) => (isZero(sum(groups.map(([, x]) => abs(x.vat)))) ? g.gross : g.vat)));
  const party = direction === 'INCOME' ? document.buyer : document.seller;
  return groups.map(([category], i) => ({
    id: entryId(payment.id, category),
    date: payment.date,
    number: document.number || null,
    direction,
    medium,
    amount: grossParts[i],
    vat: vatParts ? vatParts[i] : null,
    category,
    taxRelevant: isTaxCategory(category),
    docId: document.id,
    paymentId: payment.id,
    text: party?.name || null,
    auto: true
  })).filter(e => !isZero(e.amount) || (e.vat && !isZero(e.vat)));
}
