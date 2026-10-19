// What the buttons of the review do with the store: confirm a document
// from the Inbox (and teach its supplier), save changes, record a payment,
// delete. Each returns the saved document; errors go to the caller.
import { draftFromRecognition, emptyRecognition, pickFieldValue } from '@we-invoice/core';
import { applyValues } from './review-values.js';
import { rememberSupplier } from './supplier.js';
import { withPayment, receivedStatus } from './data.js';
import { deleteFile } from './file-store.js';

/** A blank received document of a kind, for typing one in by hand. */
export function blankDocument(kind, { company, today }) {
  const empty = emptyRecognition('MANUAL');
  empty.fields.kind = kind;
  const doc = draftFromRecognition(empty, { company, today });
  doc.inbox = null;
  return doc;
}

/** Saves the form values; a document leaving the Inbox becomes PROCESSED and its supplier is remembered. */
export async function saveDocument(store, doc, values, { regions = {}, isNew = false, today }) {
  const company = store.company();
  let next = applyValues(doc, values, { company });
  if (next.status === 'TO_PROCESS' || isNew) next.status = 'PROCESSED';
  if (next.inbox) next.inbox = { ...next.inbox, needsConfirmation: false, confirmedAt: new Date().toISOString() };
  const contact = await rememberSupplier(store, next, {
    category: values.category || undefined, paymentMethod: values.paymentMethod || undefined, regions
  });
  if (contact) next = { ...next, contactId: contact.id, seller: { ...next.seller, contactId: contact.id } };
  if (next.status !== 'BOOKED' && next.status !== 'CANCELLED') next.status = receivedStatus({ ...next, status: 'PROCESSED' }, today);
  if (isNew) {
    const { id, createdAt, updatedAt, ...fields } = next;
    void id; void createdAt; void updatedAt;
    return store.insert('documents', fields);
  }
  const { id, createdAt, updatedAt, ...patch } = next;
  void createdAt; void updatedAt;
  return store.update('documents', id, patch);
}

export async function recordPayment(store, doc, payment, today) {
  const next = withPayment(doc, payment, today);
  return store.update('documents', doc.id, { payments: next.payments, status: next.status });
}

export async function deleteDocument(store, doc) {
  await store.remove('documents', doc.id);
  for (const a of doc.attachments || []) {
    try { await deleteFile(a.id); } catch (e) { console.warn('Inbox file was not removed', e); }
  }
}

/** The value for a field from picked text, or null when it is not a valid value. */
export function pickedValue(field, text) {
  return pickFieldValue(field, text);
}
