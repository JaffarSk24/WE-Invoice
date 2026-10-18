// Recording payments in documents (document.payments) as pure functions:
// the caller stores the patches. A payment carries the sign of the
// document's payable amount, so a credit note refund lowers what is due
// the same way as an invoice payment. The stored status follows the
// payment state (PAID, PARTIALLY_PAID, OVERPAID); drafts, cancelled and
// booked documents keep theirs. Confirming a bank match writes a payment
// per allocation and marks the transaction; undoing it removes exactly
// the payments that point at the transaction.
import { paymentState, payableOf } from '../index.js';
import { allowedStatuses, isReceived } from '../../documents/kinds.js';
import { isNegative, abs, round, neg } from '../../money/index.js';
import { uuidv7 } from '../../ids/index.js';
import { CoreError } from '../../errors.js';
import { PAYMENT_METHODS, PAYMENT_SOURCES } from '../../schema/enums.js';

const KEEP = new Set(['DRAFT', 'CANCELLED', 'BOOKED']);
const PAID_STATUSES = new Set(['PAID', 'PARTIALLY_PAID', 'OVERPAID', 'OVERDUE']);
const BY_STATE = { PAID: 'PAID', OVERPAID: 'OVERPAID', PARTIAL: 'PARTIALLY_PAID' };

/** Status to store after the payments of a document changed. */
export function statusAfterPayments(document) {
  const current = document.status || 'DRAFT';
  if (KEEP.has(current)) return current;
  const target = BY_STATE[paymentState(document)];
  if (target && allowedStatuses(document.kind).includes(target)) return target;
  if (!target && PAID_STATUSES.has(current)) return isReceived(document.kind) ? 'PROCESSED' : 'ISSUED';
  return current;
}

/**
 * A payment record (schema PAYMENT) in the sign of the document.
 * @param {object} document
 * @param {{date: string, amount: string, method?: string, source?: string, currency?: string, bankTxId?: string|null,
 *   cashBookId?: string|null, ekasaReceiptId?: string|null, ekasaOkp?: string|null, note?: string|null, id?: string}} input
 */
export function makePayment(document, input) {
  const method = input.method || 'TRANSFER';
  const source = input.source || 'MANUAL';
  if (!PAYMENT_METHODS.includes(method)) throw new CoreError('PAYMENT_METHOD_INVALID', `unknown method ${method}`);
  if (!PAYMENT_SOURCES.includes(source)) throw new CoreError('PAYMENT_SOURCE_INVALID', `unknown source ${source}`);
  if (!input.date) throw new CoreError('DATE_INVALID', 'a payment needs a date');
  const value = round(abs(input.amount), 2);
  if (value === '0.00') throw new CoreError('AMOUNT_INVALID', 'a payment needs an amount');
  const signed = isNegative(payableOf(document)) ? round(neg(value), 2) : value;
  return {
    id: input.id || uuidv7(),
    date: input.date,
    amount: signed,
    currency: input.currency || document.currency || 'EUR',
    method,
    source,
    bankTxId: input.bankTxId ?? null,
    cashBookId: input.cashBookId ?? null,
    ekasaReceiptId: input.ekasaReceiptId ?? null,
    ekasaOkp: input.ekasaOkp ?? null,
    note: input.note ?? null
  };
}

/** The patch that adds a payment to a document. @returns {{payments: object[], status: string}} */
export function addPayment(document, payment) {
  if (payment.currency && document.currency && payment.currency !== document.currency) {
    throw new CoreError('PAYMENT_CURRENCY_MISMATCH', `${payment.currency} payment on a ${document.currency} document`);
  }
  const payments = [...(document.payments || []), payment];
  return { payments, status: statusAfterPayments({ ...document, payments }) };
}

/** The patch that removes payments matching a predicate. */
export function removePayments(document, predicate) {
  const payments = (document.payments || []).filter(p => !predicate(p));
  return { payments, status: statusAfterPayments({ ...document, payments }) };
}

/**
 * Confirms a match: one payment per allocation, dated by the transaction.
 * @param {object} tx  stored bankTransactions record (with id)
 * @param {{allocations: Array<{docId: string, amount: string}>, confidence: number}} proposal
 * @param {object[]} documents
 * @returns {{documents: Array<{id: string, patch: object}>, tx: {matched: object, allocations: object[]}}}
 */
export function applyMatch(tx, proposal, documents, { newId = uuidv7 } = {}) {
  if (!tx || !tx.id) throw new CoreError('BANK_TX_NOT_STORED', 'only a stored transaction can be matched');
  const byId = new Map(documents.map(d => [d.id, d]));
  const patches = proposal.allocations.map(a => {
    const doc = byId.get(a.docId);
    if (!doc) throw new CoreError('BANK_DOCUMENT_NOT_FOUND', `document ${a.docId} not found`);
    const payment = makePayment(doc, {
      id: newId(), date: tx.date, amount: a.amount, currency: tx.currency, method: 'TRANSFER', source: 'BANK_IMPORT', bankTxId: tx.id
    });
    return { id: doc.id, patch: addPayment(doc, payment) };
  });
  return {
    documents: patches,
    tx: {
      matched: { docId: proposal.allocations[0].docId, confidence: proposal.confidence, confirmed: true },
      allocations: proposal.allocations.map(a => ({ docId: a.docId, amount: a.amount }))
    }
  };
}

/** Undoes a confirmed match: removes the payments of the transaction from every document. */
export function unapplyMatch(tx, documents) {
  const patches = documents
    .filter(d => (d.payments || []).some(p => p.bankTxId === tx.id))
    .map(d => ({ id: d.id, patch: removePayments(d, p => p.bankTxId === tx.id) }));
  return { documents: patches, tx: { matched: null, allocations: [] } };
}
