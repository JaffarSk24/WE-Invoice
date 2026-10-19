// The review form's values of a received document and back: what the
// user sees and edits (supplier, numbers, dates, amounts, category,
// payment method, deduction period), the checks before saving, and the
// document rebuilt from the values. Pure functions over plain objects.
import {
  isValidIco, isValidDic, isValidVatId, isValidIban, parseAmount, add, sub, abs, cmp, div, mul, round, sum,
  draftLines, receivedTotals, withExpenseCategory, expenseCategoryOf, vatDeductionPeriodOf
} from '@we-invoice/core';

export const AMOUNT_FIELDS = Object.freeze(['net', 'vat', 'total']);
const RECEIVED = ['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT'];

const orEmpty = (v) => (v === null || v === undefined ? '' : String(v));
const orNull = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : String(v).trim());

export function valuesOf(doc) {
  const s = doc.seller || {};
  // A blank document (no lines yet) shows empty amounts, not zeros.
  const totals = (doc.lines || []).length ? (doc.totals || {}) : {};
  return {
    kind: doc.kind || 'RECEIVED_INVOICE',
    supplierName: orEmpty(s.name), ico: orEmpty(s.ico), dic: orEmpty(s.dic), icDph: orEmpty(s.icDph),
    number: orEmpty(doc.number), vs: orEmpty(doc.vs), ks: orEmpty(doc.ks), ss: orEmpty(doc.ss),
    issueDate: orEmpty(doc.issueDate), taxDate: orEmpty(doc.taxDate), dueDate: orEmpty(doc.dueDate), receivedDate: orEmpty(doc.receivedDate),
    currency: doc.currency || 'EUR',
    net: orEmpty(totals.net), vat: orEmpty(totals.vat), total: orEmpty(totals.payable ?? totals.gross),
    iban: orEmpty(doc.payee && doc.payee.iban),
    category: expenseCategoryOf(doc) || '',
    paymentMethod: doc.paymentMethod || '',
    vatDeductionPeriod: orEmpty(doc.vatDeductionPeriod),
    note: orEmpty(doc.noteInternal)
  };
}

/** Errors by field, as dictionary keys; an empty object when all is well. */
export function validateValues(v) {
  const errors = {};
  if (!RECEIVED.includes(v.kind)) errors.kind = 'purchase.error.kind';
  if (!orNull(v.supplierName)) errors.supplierName = 'purchase.error.required';
  if (orNull(v.ico) && !isValidIco(v.ico)) errors.ico = 'purchase.error.ico';
  if (orNull(v.dic) && !isValidDic(v.dic)) errors.dic = 'purchase.error.dic';
  if (orNull(v.icDph) && !isValidVatId(v.icDph)) errors.icDph = 'purchase.error.icDph';
  if (orNull(v.iban) && !isValidIban(v.iban)) errors.iban = 'purchase.error.iban';
  if (!orNull(v.issueDate)) errors.issueDate = 'purchase.error.required';
  if (orNull(v.vs) && !/^\d{1,10}$/.test(v.vs.trim())) errors.vs = 'purchase.error.vs';
  if (orNull(v.ks) && !/^\d{1,4}$/.test(v.ks.trim())) errors.ks = 'purchase.error.ks';
  if (orNull(v.ss) && !/^\d{1,10}$/.test(v.ss.trim())) errors.ss = 'purchase.error.vs';
  if (!/^[A-Z]{3}$/.test(String(v.currency || ''))) errors.currency = 'purchase.error.currency';
  if (orNull(v.vatDeductionPeriod) && !/^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/.test(v.vatDeductionPeriod.trim())) errors.vatDeductionPeriod = 'purchase.error.period';
  for (const k of AMOUNT_FIELDS) if (orNull(v[k]) && parseAmount(v[k]) === null) errors[k] = 'purchase.error.amount';
  if (!orNull(v.total)) errors.total = 'purchase.error.required';
  const net = parseAmount(v.net);
  const vat = parseAmount(v.vat);
  const total = parseAmount(v.total);
  if (!errors.total && net !== null && vat !== null && total !== null && cmp(abs(sub(add(net, vat), total)), '0.05') > 0) errors.total = 'purchase.error.sum';
  if (v.kind === 'EXPENSE_RECEIPT' && !v.paymentMethod) errors.paymentMethod = 'purchase.error.paymentMethod';
  return errors;
}

// The VAT breakdown behind edited amounts: the old one when it still adds
// up, otherwise one row at the rate the amounts imply.
export function breakdownFor(old, net, vat, vatPayer) {
  if (old && old.length && cmp(abs(sub(sum(old.map(b => b.base)), net)), '0.01') <= 0 && cmp(abs(sub(sum(old.map(b => b.vat)), vat)), '0.01') <= 0) return old;
  if (!/[1-9]/.test(vat)) return [{ category: vatPayer ? 'E' : 'O', rate: '0', base: net, vat: '0.00' }];
  const exact = div(mul(vat, '100'), net, 4);
  const whole = round(exact, 0);
  const rate = cmp(abs(sub(round(div(mul(net, whole), '100', 6), 2), vat)), '0.05') <= 0 ? String(Number(whole)) : round(exact, 2);
  return [{ category: 'S', rate, base: net, vat }];
}

function amountsChanged(doc, net, vat, total) {
  const t = doc.totals || {};
  const same = (a, b) => (a === null && (b === null || b === undefined)) || (a !== null && b !== undefined && b !== null && cmp(a, b) === 0);
  return !(same(net, t.net ?? null) && same(vat, t.vat ?? null) && same(total, t.payable ?? null));
}

/** The document with the form values applied (lines and totals rebuilt when the amounts changed). */
export function applyValues(doc, v, { company = null } = {}) {
  const icDph = orNull(v.icDph) ? v.icDph.replace(/\s/g, '').toUpperCase() : null;
  const seller = { ...(doc.seller || {}), name: v.supplierName.trim(), ico: orNull(v.ico), dic: orNull(v.dic), icDph, vatPayer: Boolean(icDph) };
  const total = round(parseAmount(v.total), 2);
  const vat = orNull(v.vat) ? round(parseAmount(v.vat), 2) : null;
  const net = orNull(v.net) ? round(parseAmount(v.net), 2) : (vat !== null ? round(sub(total, vat), 2) : null);
  let next = {
    ...doc, kind: v.kind, seller, number: orNull(v.number), vs: orNull(v.vs), ks: orNull(v.ks), ss: orNull(v.ss),
    issueDate: orNull(v.issueDate), taxDate: orNull(v.taxDate) || orNull(v.issueDate), dueDate: orNull(v.dueDate), receivedDate: orNull(v.receivedDate),
    currency: v.currency, payee: orNull(v.iban) ? { ...(doc.payee || {}), iban: v.iban.replace(/\s/g, '').toUpperCase() } : null,
    noteInternal: orNull(v.note)
  };
  if (v.paymentMethod) next.paymentMethod = v.paymentMethod;
  else delete next.paymentMethod;
  if (amountsChanged(doc, net, vat, total) || !(doc.lines || []).length) {
    const fields = { total, net, vat, breakdown: net !== null && vat !== null ? breakdownFor(doc.totals && doc.totals.breakdown, net, vat, seller.vatPayer) : [] };
    const lineName = ((doc.lines || []).find(l => l.name) || {}).name || seller.name;
    next.lines = draftLines(fields, { lineName, vatPayer: seller.vatPayer });
    next.totals = receivedTotals(next, fields);
  }
  next = withExpenseCategory(next, orNull(v.category));
  next.vatDeductionPeriod = orNull(v.vatDeductionPeriod) || vatDeductionPeriodOf(next, company);
  return next;
}
