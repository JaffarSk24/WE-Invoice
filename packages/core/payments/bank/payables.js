// Received invoices to pay, as items of a SEPA batch (pain001.js): what is
// still open, to whom and with which symbols. A document without a valid
// creditor IBAN or in another currency than EUR is listed as skipped with
// the reason, so the user sees why it is not in the file.
import { openAmount } from './match/candidates.js';
import { compactIban } from './text.js';
import { cmp } from '../../money/index.js';

const PAYABLE_OUT = new Set(['RECEIVED_INVOICE', 'EXPENSE_RECEIPT']);

/** The creditor IBAN: the contact card, else what the received document carries. */
export function creditorIbanOf(document, contact) {
  return compactIban(contact?.iban) || compactIban(document.seller?.iban) || compactIban(document.payeeIban) || compactIban(document.counterpartyIban) || null;
}

/** True for a received document that still has something to pay. */
export function isOpenPayable(document) {
  return !document.deleted && PAYABLE_OUT.has(document.kind) && !['DRAFT', 'CANCELLED'].includes(document.status)
    && cmp(openAmount(document), '0') > 0;
}

/**
 * @returns {{payments: object[], skipped: Array<{docId: string, code: string}>}}
 */
export function paymentsForReceived(documents, contacts = [], { executionDate = null } = {}) {
  const byId = new Map((contacts || []).map(c => [c.id, c]));
  const payments = [];
  const skipped = [];
  for (const doc of documents) {
    if (!isOpenPayable(doc)) continue;
    const contact = byId.get(doc.contactId) || null;
    const iban = creditorIbanOf(doc, contact);
    if ((doc.currency || 'EUR') !== 'EUR') { skipped.push({ docId: doc.id, code: 'SEPA_EUR_ONLY' }); continue; }
    if (!iban) { skipped.push({ docId: doc.id, code: 'IBAN_MISSING' }); continue; }
    payments.push({
      docId: doc.id,
      creditorName: contact?.name || doc.seller?.name || '',
      creditorIban: iban,
      creditorBic: contact?.bic || null,
      amount: openAmount(doc),
      currency: 'EUR',
      vs: doc.vs || null,
      ks: doc.ks || null,
      ss: doc.ss || null,
      message: doc.number || null,
      executionDate: executionDate || null
    });
  }
  return { payments, skipped };
}
