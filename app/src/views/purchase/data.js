// Received documents in the store: the Inbox queue (status TO_PROCESS),
// received invoices and credit notes, expense receipts; rows for the
// lists; the status shown (the stored one, or the payment state once the
// document is processed); and in demo mode the demo documents, read-only.
import { paymentStatus, uuidv7, round, expenseCategoryOf } from '@we-invoice/core';
import { getStore, hasStore } from '../../store/index.js';
import { isDemo, demoData } from '../shell/demo-mode.js';
import { todayLocal } from '../../components/dates.js';

export const RECEIVED_KINDS = Object.freeze(['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE']);
export const EXPENSE_KINDS = Object.freeze(['EXPENSE_RECEIPT']);
export const PURCHASE_KINDS = Object.freeze([...RECEIVED_KINDS, ...EXPENSE_KINDS]);
const STORED = new Set(['TO_PROCESS', 'CANCELLED', 'BOOKED']);

export function storeOrNull() {
  return hasStore() ? getStore() : null;
}

/** Whether the screens may write: a real company is open and writable. */
export function canWrite(store = storeOrNull()) {
  return !isDemo() && Boolean(store && store.company() && !store.readOnly);
}

export function purchaseDocuments(store, kinds = PURCHASE_KINDS) {
  if (!store || !store.company()) return [];
  return store.list('documents').filter(d => kinds.includes(d.kind));
}

/** The Inbox queue, newest first. */
export function inboxQueue(store) {
  return purchaseDocuments(store).filter(d => d.status === 'TO_PROCESS')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/** Processed documents of some kinds, newest issue date first. */
export function processedDocuments(store, kinds) {
  return purchaseDocuments(store, kinds).filter(d => d.status !== 'TO_PROCESS')
    .sort((a, b) => String(b.issueDate || '').localeCompare(String(a.issueDate || '')));
}

/** Status shown for a received document today. */
export function receivedStatus(doc, today = todayLocal()) {
  if (STORED.has(doc.status)) return doc.status;
  if (!doc.totals) return 'PROCESSED';
  const state = paymentStatus(doc, today);
  return { PAID: 'PAID', OVERPAID: 'OVERPAID', PARTIAL: 'PARTIALLY_PAID', OVERDUE: 'OVERDUE' }[state] || 'PROCESSED';
}

export function rowOf(doc, today = todayLocal()) {
  return {
    id: doc.id,
    kind: doc.kind,
    number: doc.number || '',
    supplier: (doc.seller && doc.seller.name) || '',
    issueDate: doc.issueDate || null,
    dueDate: doc.dueDate || null,
    total: (doc.totals && doc.totals.payable) || '0.00',
    vat: (doc.totals && doc.totals.vat) || '0.00',
    currency: doc.currency || 'EUR',
    status: receivedStatus(doc, today),
    category: expenseCategoryOf(doc),
    vatDeductionPeriod: doc.vatDeductionPeriod || null,
    confidence: doc.inbox ? doc.inbox.confidence : null,
    needsConfirmation: doc.inbox ? doc.inbox.needsConfirmation : false,
    doc
  };
}

/** Rows of the demo documents of some kinds (the demo has received invoices only). */
export function demoRows(kinds) {
  return demoData().documents.filter(d => kinds.includes(d.kind)).map(d => ({
    id: d.id, kind: d.kind, number: d.number, supplier: d.contactName, issueDate: d.issueDate, dueDate: d.dueDate,
    total: d.totalGross, vat: d.totalVat, currency: d.currency, status: d.status, category: null, vatDeductionPeriod: null,
    confidence: null, needsConfirmation: false, doc: null
  }));
}

/** Rows of a list: the store, or the demo. */
export function listRows(kinds, { inbox = false } = {}) {
  if (isDemo()) return inbox ? [] : demoRows(kinds);
  const store = storeOrNull();
  const docs = inbox ? inboxQueue(store) : processedDocuments(store, kinds);
  const today = todayLocal();
  return docs.map(d => rowOf(d, today));
}

/** The document with one more payment and its status set from the payments. */
export function withPayment(doc, { date, amount, method, note = null }, today = todayLocal()) {
  const payment = {
    id: uuidv7(), date, amount: round(amount, 2), currency: doc.currency || 'EUR', method, source: method === 'CASH' ? 'CASH' : 'MANUAL',
    bankTxId: null, cashBookId: null, ekasaReceiptId: null, ekasaOkp: null, note
  };
  const next = { ...doc, payments: [...(doc.payments || []), payment] };
  const status = doc.status === 'TO_PROCESS' ? 'PROCESSED' : doc.status;
  return { ...next, status: STORED.has(status) && status !== 'TO_PROCESS' ? status : receivedStatus({ ...next, status: 'PROCESSED' }, today) };
}
