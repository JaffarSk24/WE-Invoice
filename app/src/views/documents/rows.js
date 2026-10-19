// The rows of a document list: one flat record per document with what
// the table shows (number, client, dates, status, amounts, the eFaktura
// duty) and the filters and totals over them. Pure functions; amounts are
// decimal strings and come from the core (computeTotals, payments), so the
// list, the editor and the PDF never disagree.
import { computeTotals, documentStatus, paymentState, paidAmount, peppolRequirement, round, add, sub, cmp } from '@we-invoice/core';
import { inRange } from '../../components/dates.js';

const ZERO = '0.00';

// Stored totals, else computed; a draft that cannot be computed yet
// (a line without a rate) counts as zero instead of breaking the list.
export function safeTotals(doc) {
  if (doc.totals) return doc.totals;
  try {
    return computeTotals(doc);
  } catch (e) {
    console.warn(`Totals of document ${doc.id} cannot be computed yet`, e);
    return { net: ZERO, vat: ZERO, gross: ZERO, payable: ZERO, prepaid: ZERO, breakdown: [] };
  }
}

function demoRow(doc) {
  const paid = doc.paidAmount || ZERO;
  const gross = doc.totalGross || ZERO;
  const state = cmp(paid, gross) >= 0 && cmp(gross, '0') > 0 ? 'PAID' : cmp(paid, '0') > 0 ? 'PARTIAL' : 'UNPAID';
  return {
    net: doc.totalNet || ZERO, vat: doc.totalVat || ZERO, gross, payable: gross, paid, due: round(sub(gross, paid), 2),
    status: doc.status || 'DRAFT', paymentState: state
  };
}

function safeStatus(doc, today) {
  try {
    return documentStatus(doc, today);
  } catch (e) {
    console.warn(`Status of document ${doc.id} cannot be derived`, e);
    return doc.status || 'DRAFT';
  }
}

function safePeppol(company, contact, doc, today) {
  if (!company) return null;
  try {
    return peppolRequirement(company, contact, doc, today);
  } catch (e) {
    console.warn(`eFaktura duty of document ${doc.id} cannot be decided`, e);
    return null;
  }
}

/**
 * @param {object} doc  a stored document (or a demo summary)
 * @param {{contacts?: Map<string, object>, company?: object|null, today: string}} ctx
 */
export function documentRow(doc, { contacts = new Map(), company = null, today }) {
  const contact = doc.contactId ? contacts.get(doc.contactId) || null : null;
  const base = {
    id: doc.id, kind: doc.kind, number: doc.number || null, vs: doc.vs || null,
    contactId: doc.contactId || null, contactName: (doc.buyer && doc.buyer.name) || doc.contactName || (contact && contact.name) || '',
    issueDate: doc.issueDate || null, dueDate: doc.dueDate || null, currency: doc.currency || 'EUR',
    tags: Array.isArray(doc.tags) ? doc.tags : [], doc
  };
  if (!Array.isArray(doc.lines)) return { ...base, ...demoRow(doc), peppol: null, peppolStatus: null };
  const totals = safeTotals(doc);
  const paid = paidAmount({ ...doc, totals });
  let state = 'UNPAID';
  try { state = paymentState({ ...doc, totals }); } catch (e) { console.warn(`Payment state of ${doc.id} cannot be derived`, e); }
  return {
    ...base,
    net: round(totals.net || ZERO, 2), vat: round(totals.vat || ZERO, 2), gross: round(totals.gross || ZERO, 2),
    payable: round(totals.payable || ZERO, 2), paid, due: round(sub(totals.payable || ZERO, paid), 2),
    status: safeStatus(doc, today), paymentState: state,
    peppol: doc.status === 'DRAFT' || doc.status === 'CANCELLED' ? null : safePeppol(company, contact, doc, today),
    peppolStatus: doc.peppol && doc.peppol.direction === 'OUT' ? doc.peppol.status : null
  };
}

export function documentRows(docs, ctx) {
  return (docs || []).map(doc => documentRow(doc, ctx));
}

// Lower case without diacritics, so "kovac" finds "Kováč".
export function fold(text) {
  return String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export const PAYMENT_FILTERS = Object.freeze(['unpaid', 'partial', 'paid', 'overdue']);

function paymentMatches(row, payment) {
  if (!payment) return true;
  if (payment === 'overdue') return row.status === 'OVERDUE';
  if (payment === 'paid') return row.paymentState === 'PAID' || row.paymentState === 'OVERPAID';
  if (payment === 'partial') return row.paymentState === 'PARTIAL';
  return row.paymentState === 'UNPAID' && row.status !== 'DRAFT' && row.status !== 'CANCELLED';
}

/**
 * Rows passing a filter: { from, to, status, contact, label, currency,
 * payment, query }. The period applies to the issue date; a draft without
 * one is always shown, so a new draft never disappears from its list.
 */
export function filterRows(rows, filter = {}) {
  const contact = fold(filter.contact);
  const label = fold(filter.label);
  const query = fold(filter.query);
  return rows.filter(row => {
    if ((filter.from || filter.to) && row.issueDate && !inRange(row.issueDate, filter)) return false;
    if ((filter.from || filter.to) && !row.issueDate && row.status !== 'DRAFT') return false;
    if (filter.status && row.status !== filter.status) return false;
    if (contact && !fold(row.contactName).includes(contact)) return false;
    if (label && !row.tags.some(tag => fold(tag).includes(label))) return false;
    if (filter.currency && row.currency !== filter.currency) return false;
    if (!paymentMatches(row, filter.payment)) return false;
    if (query && ![row.number, row.contactName, row.vs].some(v => fold(v).includes(query))) return false;
    return true;
  });
}

/** Sum of a row field per currency, drafts and cancelled documents left out: [{ currency, amount }]. */
export function sumByCurrency(rows, field) {
  const totals = new Map();
  rows.forEach(row => {
    if (row.status === 'CANCELLED' || row.status === 'DRAFT') return;
    totals.set(row.currency, add(totals.get(row.currency) || '0', row[field] || '0'));
  });
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount: round(amount, 2) }));
}

// One collator for every comparison: localeCompare with options builds a
// new one each time, which made sorting 10 000 rows take most of a second.
const numeric = new Intl.Collator(undefined, { numeric: true });

/** Newest first: issue date, then number; drafts without a date on top. */
export function byNewest(a, b) {
  const da = a.issueDate || '9999-99-99';
  const db = b.issueDate || '9999-99-99';
  if (da !== db) return da < db ? 1 : -1;
  return numeric.compare(String(b.number || ''), String(a.number || ''));
}

/** The fields the dashboard reads (views/dashboard/metrics.js). */
export function dashboardDocument(row) {
  return {
    id: row.id, kind: row.kind, number: row.number, status: row.status, issueDate: row.issueDate, dueDate: row.dueDate,
    contactId: row.contactId, contactName: row.contactName, currency: row.currency,
    totalNet: row.net, totalVat: row.vat, totalGross: row.payable, paidAmount: row.paid
  };
}
