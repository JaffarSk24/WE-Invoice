// A payment in cash goes through the cash book, wherever it is recorded
// (the payments screen, the card of an issued document, a received one):
// a receipt for money taken, an expense voucher for money paid, in the
// cash book of its currency (created when there is none), tied to the
// payment both ways. Removing the payment cancels its voucher.
import { cashKindForPayment, paymentParty, abs, round } from '@we-invoice/core';
import { t } from '../../../i18n/index.js';
import { createCashBook, createVoucher } from './operations.js';

/**
 * The voucher of a cash payment just stored on a document, and the book it
 * went to; null for any other method or a payment that has its book already.
 * @returns {Promise<{book: object, voucher: object}|null>}
 */
export async function cashVoucherForPayment(store, docId, paymentId) {
  const doc = store.get('documents', docId);
  const payment = (doc.payments || []).find(p => p.id === paymentId);
  if (!payment || payment.method !== 'CASH' || payment.cashBookId) return null;
  const currency = payment.currency || doc.currency || 'EUR';
  const book = store.list('cashBooks').find(b => (b.currency || 'EUR') === currency)
    || await createCashBook(store, { name: t('cash.book.defaultName'), currency });
  const party = paymentParty(doc);
  const voucher = await createVoucher(store, {
    bookId: book.id, kind: cashKindForPayment(doc), date: payment.date, amount: round(abs(payment.amount), 2),
    purpose: t('cash.voucher.purposePayment', { number: doc.number || '' }), partner: party ? { name: party.name } : null,
    contactId: doc.contactId || null, paysDocId: doc.id, paymentId
  });
  const fresh = store.get('documents', docId);
  await store.update('documents', docId, {
    payments: fresh.payments.map(p => (p.id === paymentId ? { ...p, source: 'CASH', cashBookId: book.id } : p))
  });
  return { book, voucher };
}

/** Cancels the live voucher a payment created, if any. */
export async function cancelPaymentVoucher(store, docId, paymentId) {
  const voucher = store.list('documents').find(d => d.paymentId === paymentId && d.paysDocId === docId && d.status !== 'CANCELLED');
  if (voucher) await store.update('documents', voucher.id, { status: 'CANCELLED' });
  return voucher || null;
}

/** Brings back the voucher of a payment restored by undo. */
export async function restorePaymentVoucher(store, docId, paymentId) {
  const voucher = store.list('documents').filter(d => d.paymentId === paymentId && d.paysDocId === docId && d.status === 'CANCELLED').pop();
  if (voucher) await store.update('documents', voucher.id, { status: 'ISSUED' });
  return voucher || null;
}
