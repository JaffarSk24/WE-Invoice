// What the document screens change in the store: save a draft, issue it
// (number from the series, snapshots, totals), convert, copy, delete a
// draft, record and remove payments, move a status, unlock a locked
// document with an audit entry. Each function takes the store, so tests
// run them over a memory store; the screens add the toasts. Other
// packages hear about it through events:
//   stock:document-issued { documentId }   after a document is issued
import { issueDocument, canTransition, uuidv7, contactSnapshot, localDate } from '@we-invoice/core';
import { resolveSeries, withSeries, takenNumbers } from '../documents/series.js';
import { emit as busEmit } from '../../events.js';

const STRIP = ['id', 'createdAt', 'updatedAt', 'deleted'];

function fieldsOf(doc) {
  const fields = { ...doc };
  STRIP.forEach(k => { if (k !== 'id') delete fields[k]; });
  return fields;
}

function patchOf(doc) {
  const patch = { ...doc };
  STRIP.forEach(k => delete patch[k]);
  return patch;
}

async function audit(store, action, entityId, extra = {}) {
  try {
    await store.insert('auditLog', { at: new Date().toISOString(), actor: null, device: null, action, entity: 'document', entityId, changes: [], reason: null, ...extra });
  } catch (e) {
    console.error(`Audit entry ${action} for ${entityId} could not be written`, e);
  }
}

/** Inserts a new draft or updates a stored one; returns the stored record. */
export async function saveDocument(store, doc) {
  if (store.get('documents', doc.id)) return store.update('documents', doc.id, patchOf(doc));
  return store.insert('documents', fieldsOf(doc));
}

/**
 * Issues a draft (the Issue button). Missing particulars come back as
 * CoreError DOCUMENT_INCOMPLETE with details.missing, nothing is stored.
 * The buyer snapshot is taken again from the contact card so the issued
 * document carries the client as it is today.
 * @returns {Promise<object>} the issued document
 */
export async function issueDraft(store, draft, { emit = busEmit, now = new Date().toISOString(), today = localDate(now) } = {}) {
  const company = store.company();
  const contact = draft.contactId ? store.get('contacts', draft.contactId) : null;
  const { series, created } = resolveSeries(company, draft.kind, draft.seriesId);
  const prepared = { ...draft, seller: null, buyer: contact ? contactSnapshot(contact) : draft.buyer };
  const taken = takenNumbers(store.list('documents'), series.id);
  const result = issueDocument(prepared, { company, contact, series, taken, now, today });
  // The document first: should the series fail to save, the number is
  // still taken and the next issue skips it, so no number is used twice.
  const stored = await saveDocument(store, result.document);
  await store.updateCompany({ series: withSeries(company, created ? { ...result.series, isDefault: true } : result.series) });
  await audit(store, 'ISSUE', stored.id);
  emit('stock:document-issued', { documentId: stored.id });
  return stored;
}

/** Stores a converted or copied draft. */
export async function createDraft(store, draft) {
  return store.insert('documents', fieldsOf(draft));
}

/** Deletes a draft (tombstone). An issued document is never deleted: it is corrected by a credit note. */
export async function deleteDraft(store, id) {
  const doc = store.get('documents', id);
  if (!doc) return null;
  if (doc.status !== 'DRAFT') {
    const error = new Error('Only a draft can be deleted');
    error.code = 'DOCUMENT_NOT_DRAFT';
    throw error;
  }
  return store.remove('documents', id);
}

/**
 * Records a payment on a document in its currency.
 * @param {{date: string, amount: string, method: string, note?: string, ekasaReceiptId?: string, ekasaOkp?: string}} payment
 */
export async function addPayment(store, docId, payment) {
  const doc = store.get('documents', docId);
  const entry = {
    id: payment.id || uuidv7(), date: payment.date, amount: payment.amount, currency: doc.currency || 'EUR', method: payment.method,
    source: payment.method === 'CASH' ? 'CASH' : 'MANUAL', bankTxId: null, cashBookId: null,
    ekasaReceiptId: payment.ekasaReceiptId || null, ekasaOkp: payment.ekasaOkp || null, note: payment.note || null
  };
  await store.update('documents', docId, { payments: [...(doc.payments || []), entry] });
  return entry;
}

export async function updatePayment(store, docId, paymentId, patch) {
  const doc = store.get('documents', docId);
  const payments = (doc.payments || []).map(p => (p.id === paymentId ? { ...p, ...patch } : p));
  return store.update('documents', docId, { payments });
}

export async function removePayment(store, docId, paymentId) {
  const doc = store.get('documents', docId);
  return store.update('documents', docId, { payments: (doc.payments || []).filter(p => p.id !== paymentId) });
}

/** Moves a document to a status the user may choose (accepted, rejected, sent, cancelled...). */
export async function setStatus(store, docId, status) {
  const doc = store.get('documents', docId);
  if (!canTransition(doc.kind, doc.status, status)) {
    const error = new Error(`${doc.kind} cannot move from ${doc.status} to ${status}`);
    error.code = 'STATUS_TRANSITION_INVALID';
    throw error;
  }
  const updated = await store.update('documents', docId, { status });
  if (status === 'CANCELLED') await audit(store, 'UPDATE', docId, { changes: [{ field: 'status', from: doc.status, to: status }] });
  return updated;
}

/** Unlocks a locked document after the user confirmed why (02-architecture.md § 2.4.3). */
export async function unlockDocument(store, docId, reason) {
  const doc = store.get('documents', docId);
  const updated = await store.update('documents', docId, { lockedAt: null });
  await audit(store, 'UNLOCK', docId, { reason: reason || null, changes: [{ field: 'lockedAt', from: doc.lockedAt, to: null }] });
  return updated;
}
