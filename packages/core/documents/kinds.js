// What each document kind is (03-features.md § 3.6): its UNCL1001 code
// for UBL, whether it is a tax document, whether it is paid, and the
// statuses and transitions of its lifecycle.
import { CoreError } from '../errors.js';
import { DOCUMENT_KINDS } from '../schema/enums.js';

// UNCL1001 codes. 386 (prepayment invoice) is used for the tax document
// to a received advance; the FS table "Transpozícia Peppol BIS3" v1.12
// lists 388 for Slovakia, so WP-PEPPOL fixes the final code against the
// official table. 389 is the self-billed invoice.
const UBL_TYPE_CODES = Object.freeze({
  INVOICE: '380',
  CREDIT_NOTE: '381',
  DEBIT_NOTE: '383',
  ADVANCE_TAX_DOC: '386',
  SELF_BILLING: '389'
});

// Kinds that are tax documents under zákon o DPH (§ 71 ods. 1).
export const TAX_KINDS = Object.freeze(['INVOICE', 'ADVANCE_TAX_DOC', 'CREDIT_NOTE', 'DEBIT_NOTE', 'SELF_BILLING']);

// Kinds that carry an amount to be paid (or refunded) and so have payment statuses.
export const PAYABLE_KINDS = Object.freeze([
  'INVOICE', 'PROFORMA', 'ADVANCE_TAX_DOC', 'CREDIT_NOTE', 'DEBIT_NOTE', 'SELF_BILLING', 'SALES_RECEIPT',
  'RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT'
]);

const RECEIVED_KINDS = ['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT'];

const PAYABLE_FLOW = ['DRAFT', 'ISSUED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERPAID', 'OVERDUE', 'CANCELLED'];
const OFFER_FLOW = ['DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'];
const ORDER_FLOW = ['DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'REJECTED', 'PROCESSED', 'CANCELLED'];
const SIMPLE_FLOW = ['DRAFT', 'ISSUED', 'SENT', 'PROCESSED', 'CANCELLED'];
const CASH_FLOW = ['DRAFT', 'ISSUED', 'CANCELLED'];
const RECEIVED_FLOW = ['TO_PROCESS', 'PROCESSED', 'PARTIALLY_PAID', 'PAID', 'OVERPAID', 'OVERDUE', 'BOOKED', 'CANCELLED'];

const STATUSES = Object.freeze({
  INVOICE: PAYABLE_FLOW, PROFORMA: PAYABLE_FLOW, ADVANCE_TAX_DOC: PAYABLE_FLOW, CREDIT_NOTE: PAYABLE_FLOW,
  DEBIT_NOTE: PAYABLE_FLOW, SELF_BILLING: PAYABLE_FLOW, SALES_RECEIPT: PAYABLE_FLOW,
  QUOTE: OFFER_FLOW, ORDER_IN: ORDER_FLOW, ORDER_OUT: ORDER_FLOW, DELIVERY_NOTE: SIMPLE_FLOW, REMINDER: SIMPLE_FLOW,
  CASH_IN: CASH_FLOW, CASH_OUT: CASH_FLOW, INTERNAL: CASH_FLOW,
  RECEIVED_INVOICE: RECEIVED_FLOW, RECEIVED_CREDIT_NOTE: RECEIVED_FLOW, EXPENSE_RECEIPT: RECEIVED_FLOW
});

// Explicit transitions a user may make. Payment statuses (PAID, OVERDUE...)
// are derived from payments and dates by documentStatus, not set by hand,
// except for received documents where the user marks the payment.
const USER_TRANSITIONS = Object.freeze({
  DRAFT: ['ISSUED', 'CANCELLED'],
  ISSUED: ['SENT', 'ACCEPTED', 'REJECTED', 'PROCESSED', 'CANCELLED'],
  SENT: ['ACCEPTED', 'REJECTED', 'PROCESSED', 'CANCELLED'],
  ACCEPTED: ['PROCESSED', 'CANCELLED'],
  REJECTED: ['CANCELLED'],
  EXPIRED: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  TO_PROCESS: ['PROCESSED', 'CANCELLED'],
  PROCESSED: ['BOOKED', 'CANCELLED'],
  PARTIALLY_PAID: ['CANCELLED'],
  OVERDUE: ['CANCELLED'],
  PAID: ['BOOKED'],
  OVERPAID: ['BOOKED'],
  BOOKED: [],
  CANCELLED: []
});

function assertKind(kind) {
  if (!DOCUMENT_KINDS.includes(kind)) throw new CoreError('DOCUMENT_KIND_INVALID', `unknown document kind ${kind}`);
  return kind;
}

/** UNCL1001 type code for UBL, or null for non-tax documents. @returns {string|null} */
export function ublTypeCode(kind) {
  assertKind(kind);
  return UBL_TYPE_CODES[kind] || null;
}

/** True for tax documents (faktúra, dobropis, ťarchopis, daňový doklad k platbe, self-billing). */
export function isTaxDocument(kind) {
  return TAX_KINDS.includes(kind);
}

/** True for kinds whose status follows payments. */
export function isPayable(kind) {
  return PAYABLE_KINDS.includes(kind);
}

/** True for documents the company receives rather than issues. */
export function isReceived(kind) {
  return RECEIVED_KINDS.includes(kind);
}

/** Statuses a kind may take, in lifecycle order. @returns {string[]} */
export function allowedStatuses(kind) {
  assertKind(kind);
  return [...STATUSES[kind]];
}

/** True when a user may move a document of the kind from one status to another. */
export function canTransition(kind, from, to) {
  const allowed = allowedStatuses(kind);
  if (!allowed.includes(from) || !allowed.includes(to)) return false;
  return (USER_TRANSITIONS[from] || []).includes(to);
}
