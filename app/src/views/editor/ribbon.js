// The status ribbon of a document card (07-ui-ux-i18n.md § 7.3):
// vystavená, odoslaná, doručená, uhradená for documents to be paid;
// vystavená, odoslaná, akceptovaná for quotes and orders. Pure, so the
// steps reached can be tested.
import { isPayable } from '@we-invoice/core';

const DELIVERED = new Set(['DELIVERED', 'ACCEPTED']);

/** @returns {Array<{id: string, done: boolean}>} */
export function ribbonSteps(doc, status) {
  const sent = Boolean((doc.sendLog || []).some(e => e.result === 'OK' || e.result === 'SENT')) || doc.status === 'SENT' || Boolean(doc.peppol && doc.peppol.sentAt);
  const issued = status !== 'DRAFT';
  if (isPayable(doc.kind)) {
    const delivered = Boolean(doc.peppol && DELIVERED.has(doc.peppol.status));
    const paid = status === 'PAID' || status === 'OVERPAID';
    return [
      { id: 'ISSUED', done: issued }, { id: 'SENT', done: sent || delivered }, { id: 'DELIVERED', done: delivered }, { id: 'PAID', done: paid }
    ];
  }
  const accepted = status === 'ACCEPTED' || status === 'PROCESSED';
  return [{ id: 'ISSUED', done: issued }, { id: 'SENT', done: sent || accepted }, { id: 'ACCEPTED', done: accepted }];
}
