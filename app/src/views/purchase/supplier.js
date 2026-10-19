// Remembered suppliers: the contact of the supplier of a received document
// (found by IČO, IČ DPH, IBAN or name, created when missing) carries the
// purchase template (category, payment method, line text, picked regions)
// that the next document from the same supplier starts from.
import { findSupplierContact, learnTemplate } from '@we-invoice/core';

/** The supplier contact of recognised fields or a document seller, or null. */
export function supplierContactOf(store, fields) {
  return findSupplierContact(store.list('contacts'), fields);
}

export function fieldsOfSeller(doc) {
  const s = doc.seller || {};
  return { ico: s.ico, icDph: s.icDph, iban: doc.payee ? doc.payee.iban : null, supplierName: s.name };
}

function newContact(doc, template) {
  const s = doc.seller || {};
  const address = s.address || {};
  return {
    kind: 'COMPANY',
    name: s.name || '',
    ico: s.ico || null,
    dic: s.dic || null,
    icDph: s.icDph || null,
    country: address.country || 'SK',
    billingAddress: { street: address.street || '', city: address.city || '', zip: address.zip || '', country: address.country || 'SK' },
    deliveryAddresses: [],
    emails: [],
    iban: doc.payee ? doc.payee.iban : null,
    tags: ['supplier'],
    note: '',
    purchaseTemplate: template
  };
}

/**
 * Creates or updates the supplier contact of a confirmed document and
 * teaches it the user's choices. Returns the contact. A document without
 * a supplier name gets no contact.
 */
export async function rememberSupplier(store, doc, choices) {
  const s = doc.seller || {};
  if (!s.name) return null;
  const existing = (s.contactId && store.get('contacts', s.contactId)) || supplierContactOf(store, fieldsOfSeller(doc));
  if (!existing) return store.insert('contacts', newContact(doc, learnTemplate(null, choices)));
  const patch = { purchaseTemplate: learnTemplate(existing.purchaseTemplate, choices) };
  if (!existing.iban && doc.payee && doc.payee.iban) patch.iban = doc.payee.iban;
  if (!existing.ico && s.ico) patch.ico = s.ico;
  if (!existing.icDph && s.icDph) patch.icDph = s.icDph;
  return store.update('contacts', existing.id, patch);
}
