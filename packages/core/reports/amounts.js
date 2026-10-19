// What a document contributes to the reports: whether it is a sale or a
// purchase, whether it counts at all (drafts and cancelled documents do
// not), its signed amounts in EUR and the party it belongs to. Every
// report goes through these helpers, so a credit note lowers the sales in
// all of them the same way. Amounts are decimal strings (money module).
import { add, sub, div, round, cmp, sum, abs, neg, isZero } from '../money/index.js';
import { computeTotals } from '../vat/index.js';

// Sales: the tax documents and receipts the company issues. A proforma is
// a request for payment and an order is a promise, so neither is revenue.
// The advance tax document counts: the final invoice deducts it.
const SALES = new Set(['INVOICE', 'ADVANCE_TAX_DOC', 'DEBIT_NOTE', 'CREDIT_NOTE', 'SALES_RECEIPT']);
const PURCHASES = new Set(['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT']);
const NEGATIVE = new Set(['CREDIT_NOTE', 'RECEIVED_CREDIT_NOTE']);
// Documents that are claims to collect or to pay (aging, cash flow).
const RECEIVABLE = new Set(['INVOICE', 'DEBIT_NOTE', 'SALES_RECEIPT']);
const PAYABLE = new Set(['RECEIVED_INVOICE', 'EXPENSE_RECEIPT']);
const NOT_COUNTED = new Set(['DRAFT', 'CANCELLED']);

export const BASE_CURRENCY = 'EUR';

export function isSaleDoc(doc) { return SALES.has(doc.kind); }
export function isPurchaseDoc(doc) { return PURCHASES.has(doc.kind); }
export function isReceivableDoc(doc) { return RECEIVABLE.has(doc.kind); }
export function isPayableDoc(doc) { return PAYABLE.has(doc.kind); }

/** True for a live document that is neither a draft nor cancelled. */
export function counts(doc) {
  return Boolean(doc) && !doc.deleted && !NOT_COUNTED.has(doc.status || 'DRAFT');
}

/** -1 for credit notes, 1 for everything else. */
export function signOf(doc) {
  return NEGATIVE.has(doc.kind) ? -1 : 1;
}

function signed(value, sign) {
  const a = abs(value);
  return sign < 0 && !isZero(a) ? neg(a) : a;
}

// The date a document belongs to in a period report: the tax date for tax
// documents, otherwise the issue date (received documents: the date they
// arrived when no issue date was typed).
export function reportDate(doc) {
  return doc.taxDate || doc.issueDate || doc.receivedDate || null;
}

/** Stored totals, computed when missing (an imported or old document). */
export function totalsOf(doc) {
  if (doc.totals && doc.totals.gross !== undefined) return doc.totals;
  return computeTotals(doc);
}

// A document amount in EUR. fxRate is stored the ECB way (document
// currency units per 1 EUR). Without a rate the amount cannot be
// converted and is reported as it is; `converted` says which happened.
export function toEur(amount, doc) {
  if (!doc.currency || doc.currency === BASE_CURRENCY) return { amount: round(amount, 2), converted: true };
  if (!doc.fxRate || isZero(doc.fxRate)) return { amount: round(amount, 2), converted: false };
  return { amount: round(div(amount, doc.fxRate, 10), 2), converted: true };
}

function paidOf(doc) {
  const payments = (doc.payments || []).filter(p => p && !p.deleted && (!p.currency || !doc.currency || p.currency === doc.currency));
  return sum(payments.map(p => p.amount || '0'));
}

/**
 * Signed amounts of a document in EUR: net, vat, gross, the payable total,
 * what has been paid and what is still due (never below zero).
 * @returns {{net: string, vat: string, gross: string, payable: string, paid: string, due: string, converted: boolean}}
 */
export function eurAmounts(doc) {
  const totals = totalsOf(doc);
  const sign = signOf(doc);
  const payable = totals.payable ?? totals.gross;
  const rawDue = sub(abs(payable), abs(paidOf(doc)));
  const parts = {
    net: toEur(signed(totals.net, sign), doc),
    vat: toEur(signed(totals.vat, sign), doc),
    gross: toEur(signed(totals.gross, sign), doc),
    payable: toEur(signed(payable, sign), doc),
    paid: toEur(signed(paidOf(doc), sign), doc),
    due: toEur(cmp(rawDue, '0') > 0 ? rawDue : '0', doc)
  };
  return {
    net: parts.net.amount, vat: parts.vat.amount, gross: parts.gross.amount, payable: parts.payable.amount,
    paid: parts.paid.amount, due: parts.due.amount, converted: parts.net.converted
  };
}

/** The other party of a document: the buyer of a sale, the seller of a purchase. */
export function partyOf(doc) {
  const snapshot = isPurchaseDoc(doc) ? doc.seller : doc.buyer;
  const name = (snapshot && snapshot.name) || doc.contactName || '';
  const id = doc.contactId || (snapshot && snapshot.contactId) || null;
  return { id, name, key: id || (name ? `name:${name.toLowerCase()}` : 'unknown') };
}

/** Adds an amount to a named total of a map entry, creating it when missing. */
export function bump(map, key, init, fields) {
  let entry = map.get(key);
  if (!entry) {
    entry = init();
    map.set(key, entry);
  }
  Object.entries(fields).forEach(([field, value]) => {
    entry[field] = typeof value === 'number' ? (entry[field] || 0) + value : add(entry[field] || '0', value);
  });
  return entry;
}

/** Rounds the named decimal fields of each row to 2 places, in place. */
export function fixed2(rows, fields) {
  for (const row of rows) for (const field of fields) row[field] = round(row[field] || '0', 2);
  return rows;
}

/** Sorts rows by a decimal field, largest first. */
export function byAmountDesc(field) {
  return (a, b) => cmp(b[field], a[field]);
}
