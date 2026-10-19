// The cash desk (pokladnica): cash books (collection cashBooks) and their
// vouchers, príjmový (CASH_IN) and výdavkový (CASH_OUT) pokladničný doklad,
// stored as documents with the cashBookId of their book. Vouchers are
// numbered by the book's own series; the balance is the opening balance
// plus receipts less expenses; the pokladničná kniha lists them by date
// with the running balance. A book that does not allow a negative balance
// gets a warning before an expense would take it below zero.
import { nextNumber } from '../../numbering/index.js';
import { computeTotals } from '../../vat/index.js';
import { add, sub, round, cmp, abs, isNegative } from '../../money/index.js';
import { uuidv7 } from '../../ids/index.js';
import { CoreError } from '../../errors.js';
import { kindFitsDirection } from './match/candidates.js';
import { cashVatLine, cashVatProblems } from './cash-vat.js';

export const CASH_KINDS = Object.freeze(['CASH_IN', 'CASH_OUT']);
// Sorts after every real number of the same day.
const LAST = String.fromCharCode(0xffff);

/** Default series of a book: PPD/VPD per year, a suffix for every book after the first. */
export function defaultCashSeries(kind, bookIndex = 0) {
  const prefix = kind === 'CASH_IN' ? 'PPD' : 'VPD';
  const suffix = bookIndex > 0 ? `${bookIndex + 1}-` : '';
  return { id: uuidv7(), name: `${prefix}${suffix}`, kind, mask: `${prefix}${suffix}{YYYY}{N:4}`, reset: 'YEARLY', isDefault: bookIndex === 0, counters: {} };
}

/** Vouchers of one book that count: live, not cancelled. */
export function bookVouchers(book, documents) {
  return (documents || []).filter(d => !d.deleted && CASH_KINDS.includes(d.kind) && d.cashBookId === book.id && d.status !== 'CANCELLED');
}

const amountOf = (voucher) => round(abs(voucher.totals?.payable ?? computeTotals(voucher).payable), 2);
const signed = (voucher) => (voucher.kind === 'CASH_IN' ? amountOf(voucher) : round(`-${amountOf(voucher)}`, 2));
const order = (a, b) => String(a.issueDate).localeCompare(String(b.issueDate)) || String(a.number || '').localeCompare(String(b.number || ''))
  || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));

/** Balance of a book at the end of a day (all vouchers without `until`). */
export function cashBalance(book, documents, until = null) {
  const total = bookVouchers(book, documents)
    .filter(v => !until || v.issueDate <= until)
    .reduce((s, v) => add(s, signed(v)), book.openingBalance || '0');
  return round(total, 2);
}

/**
 * Pokladničná kniha for a period: opening balance on `from`, one row per
 * voucher with income, expense and running balance, the closing balance.
 * @returns {{opening: string, closing: string, income: string, expense: string, rows: object[]}}
 */
export function cashBookRows(book, documents, { from = null, to = null } = {}) {
  const all = bookVouchers(book, documents).sort(order);
  let balance = round(book.openingBalance || '0', 2);
  all.filter(v => from && v.issueDate < from).forEach(v => { balance = round(add(balance, signed(v)), 2); });
  const opening = balance;
  let income = '0.00';
  let expense = '0.00';
  const rows = all.filter(v => (!from || v.issueDate >= from) && (!to || v.issueDate <= to)).map(v => {
    const amount = amountOf(v);
    if (v.kind === 'CASH_IN') income = round(add(income, amount), 2); else expense = round(add(expense, amount), 2);
    balance = round(add(balance, signed(v)), 2);
    const party = v.kind === 'CASH_IN' ? v.buyer : v.seller;
    return {
      id: v.id, date: v.issueDate, number: v.number, kind: v.kind, partner: party?.name || '',
      purpose: v.lines?.[0]?.name || '', income: v.kind === 'CASH_IN' ? amount : null, expense: v.kind === 'CASH_OUT' ? amount : null, balance
    };
  });
  return { opening, closing: balance, income, expense, rows };
}

/**
 * Whether an expense would take the balance below zero on its day or on
 * any later day of the book. @returns {{negative: boolean, lowest: string}}
 */
export function checkCashOut(book, documents, { date, amount, excludeId = null }) {
  const others = bookVouchers(book, documents).filter(v => v.id !== excludeId);
  const probe = { id: '__probe', kind: 'CASH_OUT', issueDate: date, number: LAST, totals: { payable: round(abs(amount), 2) } };
  const timeline = [...others, probe].sort(order);
  let balance = round(book.openingBalance || '0', 2);
  let lowest = null;
  timeline.forEach(v => {
    balance = round(add(balance, signed(v)), 2);
    if (v.issueDate >= date && (lowest === null || cmp(balance, lowest) < 0)) lowest = balance;
  });
  return { negative: !book.allowNegative && isNegative(lowest ?? balance), lowest: lowest ?? balance };
}

/** Cash direction of a payment on a document: money in for our invoices, out for received ones. */
export function cashKindForPayment(document) {
  return kindFitsDirection(document.kind, 'IN') ? 'CASH_IN' : 'CASH_OUT';
}

// The VAT choice of a voucher: `vat` ("S:23", "AE", "E", "O"), else the
// older `vatRate` (a standard rate or none).
function vatChoice(input) {
  if (input.vat) return input.vat;
  return input.vatRate ? `S:${input.vatRate}` : 'O';
}

/**
 * A new voucher and the counter update of its series. The amount is what
 * changes hands: VAT included for a rate, the base for AE, E and O. A
 * reverse charge voucher needs the partner's Slovak IČ DPH. An expense is
 * received on its own date, which places it in the VAT records.
 * @param {{book: object, kind: string, date: string, amount: string, purpose: string,
 *   partner?: {name?: string, icDph?: string|null, ico?: string|null, dic?: string|null}|null,
 *   contactId?: string|null, series: object, taken?: string[], vat?: string, vatRate?: string|null,
 *   paysDocId?: string|null, paymentId?: string|null, id?: string}} input
 * @returns {{voucher: object, series: object}}
 */
export function buildCashVoucher(input) {
  const { book, kind, date, amount, purpose, series } = input;
  if (!CASH_KINDS.includes(kind)) throw new CoreError('CASH_KIND_INVALID', `unknown voucher kind ${kind}`);
  if (!series) throw new CoreError('CASH_SERIES_MISSING', 'the cash book has no series');
  const value = round(abs(amount), 2);
  if (cmp(value, '0') <= 0) throw new CoreError('AMOUNT_INVALID', 'a voucher needs an amount');
  const vat = cashVatLine(vatChoice(input), date);
  const [problem] = cashVatProblems(vat.vatCategory, input.partner);
  if (problem) throw new CoreError(problem, `voucher ${vat.vatCategory} for ${input.partner?.name || 'no partner'}`);
  const { number, counterKey, nextCounter } = nextNumber(series, { date, taken: input.taken || [] });
  const line = { id: uuidv7(), kind: 'ITEM', name: String(purpose || '').slice(0, 500), qty: '1', unitPrice: value, priceType: 'GROSS', ...vat };
  const party = input.partner ? partySnapshot(input.partner, input.contactId) : null;
  const voucher = {
    id: input.id || uuidv7(),
    kind, status: 'ISSUED', seriesId: series.id, number, cashBookId: book.id,
    issueDate: date, taxDate: date, receivedDate: kind === 'CASH_OUT' ? date : null, currency: book.currency, contactId: input.contactId || null,
    buyer: kind === 'CASH_IN' ? party : null, seller: kind === 'CASH_OUT' ? party : null,
    lines: [line], payments: [], paymentMethod: 'CASH',
    paysDocId: input.paysDocId || null, paymentId: input.paymentId || null
  };
  const totals = computeTotals(voucher);
  voucher.totals = { lineNet: totals.lineNet, allowances: totals.allowances, charges: totals.charges, net: totals.net, vat: totals.vat, gross: totals.gross, prepaid: totals.prepaid, rounding: totals.rounding, payable: totals.payable, breakdown: totals.breakdown };
  return { voucher, series: { ...series, counters: { ...(series.counters || {}), [counterKey]: nextCounter } } };
}

// The partner on the voucher: the name and the ids the VAT reports read.
function partySnapshot(partner, contactId) {
  const id = (value) => (value ? String(value).replace(/\s+/g, '').toUpperCase() : null);
  return { ...partner, contactId: contactId || null, name: partner.name || '', icDph: id(partner.icDph), ico: partner.ico || null, dic: partner.dic || null };
}

/** Difference of the counted cash against the book: positive is a surplus. */
export function cashDifference(book, documents, counted, date) {
  return round(sub(counted, cashBalance(book, documents, date)), 2);
}
