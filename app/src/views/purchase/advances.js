// A received invoice and the paid proforma (zálohová faktúra) it settles,
// in the store. After a received document is saved or paid, the pair is
// looked for and linked at once (payments/advances.js in the core decides
// which); the user sees it on both documents and can undo it or link one
// by hand. The link changes only what counts as paid, so no money moves
// and no closed VAT period is touched.
import { findAdvanceFor, findInvoiceFor, withAdvance, withoutAdvance, settlementAmount } from '@we-invoice/core';
import { receivedStatus } from './data.js';
import { todayLocal } from '../../components/dates.js';

const KEPT = new Set(['TO_PROCESS', 'BOOKED', 'CANCELLED']);

async function saveLinks(store, invoice, next, today) {
  const status = KEPT.has(invoice.status) ? invoice.status : receivedStatus({ ...next, status: 'PROCESSED' }, today);
  return store.update('documents', invoice.id, { links: next.links, status });
}

/** Links the invoice to the proforma; returns the saved invoice. */
export async function linkAdvance(store, invoice, proforma, { amount = null, today = todayLocal() } = {}) {
  return saveLinks(store, invoice, withAdvance(invoice, proforma, amount ?? settlementAmount(invoice, proforma)), today);
}

/** Removes the link to the proforma; returns the saved invoice. */
export async function unlinkAdvance(store, invoice, proformaId, { today = todayLocal() } = {}) {
  return saveLinks(store, invoice, withoutAdvance(invoice, proformaId), today);
}

/**
 * Settles what a just saved or paid received document makes clear: an
 * invoice finds its paid proforma, a proforma its invoice.
 * @returns {Promise<{invoice: object, proforma: object}|null>} the pair linked, or null
 */
export async function settleAdvances(store, docId, { today = todayLocal() } = {}) {
  const doc = store.get('documents', docId);
  if (!doc || doc.deleted) return null;
  const all = store.list('documents');
  if (doc.kind === 'RECEIVED_INVOICE') {
    const hit = findAdvanceFor(doc, all);
    if (!hit) return null;
    return { invoice: await linkAdvance(store, doc, hit.proforma, { amount: hit.amount, today }), proforma: hit.proforma };
  }
  if (doc.kind === 'RECEIVED_PROFORMA') {
    const hit = findInvoiceFor(doc, all);
    if (!hit) return null;
    return { invoice: await linkAdvance(store, hit.invoice, doc, { amount: hit.amount, today }), proforma: doc };
  }
  return null;
}

/** settleAdvances for several documents (a bank match pays more than one); the pairs linked. */
export async function settleAdvancesOf(store, ids, options = {}) {
  const pairs = [];
  for (const id of new Set(ids)) {
    const pair = await settleAdvances(store, id, options);
    if (pair) pairs.push(pair);
  }
  return pairs;
}

/** The paid proformas an invoice settles, each with the amount: [{proforma, amount}]. */
export function advancesOf(invoice, documents) {
  return (invoice.links || []).filter(l => l.kind === 'ADVANCE_PAID')
    .map(l => ({ proforma: documents.find(d => d.id === l.docId) || null, amount: l.amount || '0.00', docId: l.docId }));
}

/** The invoices that settle a proforma. */
export function invoicesOf(proforma, documents) {
  return documents.filter(d => !d.deleted && (d.links || []).some(l => l.kind === 'ADVANCE_PAID' && l.docId === proforma.id));
}
