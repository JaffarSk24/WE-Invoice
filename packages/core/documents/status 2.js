// Status shown for a document today and whether it may still be edited
// (02-architecture.md § 2.4.3). Payment statuses are derived from the
// payments and the due date, offers expire by their validity date.
import { paymentStatus } from '../payments/index.js';
import { localDate } from './dates.js';
import { isPayable, allowedStatuses } from './kinds.js';

const FINAL = new Set(['CANCELLED', 'BOOKED', 'ACCEPTED', 'REJECTED', 'PROCESSED']);
const OPEN_PEPPOL = new Set(['DRAFT', 'VALIDATING', 'READY', 'INVALID', 'FAILED']);

/**
 * Status shown today: a draft or a final status as stored; for payable
 * kinds PAID, PARTIALLY_PAID, OVERPAID or OVERDUE from the payments; for
 * an offer EXPIRED after its validity date.
 * @param {import('../schema/types.js').Document} document
 * @param {string} [today]  local calendar date, defaults to today in Bratislava
 * @returns {string}
 */
export function documentStatus(document, today = localDate()) {
  const status = document.status || 'DRAFT';
  if (status === 'DRAFT' || status === 'TO_PROCESS' || FINAL.has(status)) return status;
  if (isPayable(document.kind)) {
    const paid = paymentStatus(document, today);
    if (paid === 'PAID') return 'PAID';
    if (paid === 'OVERPAID') return 'OVERPAID';
    if (paid === 'OVERDUE') return 'OVERDUE';
    if (paid === 'PARTIAL') return 'PARTIALLY_PAID';
    return status === 'PARTIALLY_PAID' || status === 'OVERDUE' || status === 'PAID' || status === 'OVERPAID' ? 'ISSUED' : status;
  }
  if (document.kind === 'QUOTE' && document.validUntil && document.validUntil < today) return 'EXPIRED';
  return allowedStatuses(document.kind).includes(status) ? status : 'DRAFT';
}

/**
 * Whether a document may be edited. A document sent through Peppol is
 * never editable (corrections go through a credit or debit note); a
 * locked one (sent, exported) only after explicit confirmation, which
 * the interface asks for; a cancelled one not at all.
 * @returns {{editable: boolean, reason?: string}} reason is an error code (errors.<reason>)
 */
export function canEdit(document) {
  const peppol = document.peppol;
  if (peppol && peppol.direction === 'OUT' && peppol.status && !OPEN_PEPPOL.has(peppol.status)) {
    return { editable: false, reason: 'DOCUMENT_PEPPOL_SENT' };
  }
  if (document.status === 'CANCELLED') return { editable: false, reason: 'DOCUMENT_CANCELLED' };
  if (document.lockedAt) return { editable: false, reason: 'DOCUMENT_LOCKED' };
  return { editable: true };
}

/** True when a locked document may be unlocked (never after Peppol). */
export function canUnlock(document) {
  const { reason } = canEdit(document);
  return reason === 'DOCUMENT_LOCKED';
}
