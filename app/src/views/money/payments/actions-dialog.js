// What can be done with one payment: open the eKasa helper (cash, card or
// on-site QR payment of a sale) and remove a payment recorded by hand,
// together with the cash voucher it created. A payment from a bank
// statement is undone by unmatching the movement, an offset by its
// protocol, so they are not removed here.
import { h } from '../../../ui/dom.js';
import { openModal, confirmDialog } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';
import { removePayments, cancelOffset, EKASA_METHODS, ekasaExempt } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { canWrite, guarded } from '../shared/write.js';
import { money, day } from '../shared/format.js';
import { openEkasaDialog } from './ekasa-dialog.js';
import { printOffset } from './offset-print.js';

const SALES = new Set(['INVOICE', 'PROFORMA', 'ADVANCE_TAX_DOC', 'DEBIT_NOTE', 'SALES_RECEIPT']);

export async function removeManualPayment(store, docId, paymentId) {
  const doc = store.get('documents', docId);
  await store.update('documents', docId, removePayments(doc, p => p.id === paymentId));
  const voucher = store.list('documents').find(d => d.paymentId === paymentId && d.paysDocId === docId && d.status !== 'CANCELLED');
  if (voucher) await store.update('documents', voucher.id, { status: 'CANCELLED' });
}

/** Cancels an offset: its payments leave every document, the protocol is cancelled. */
export async function cancelOffsetProtocol(store, offsetId) {
  for (const { id, patch } of cancelOffset(offsetId, store.list('documents'))) await store.update('documents', id, patch);
  await store.update('documents', offsetId, { status: 'CANCELLED' });
}

export function openPaymentActions(ctx, docId, paymentId) {
  const state = moneyState();
  const doc = state.documents.find(d => d.id === docId);
  const payment = doc?.payments?.find(p => p.id === paymentId);
  if (!payment) return;
  const amount = money(String(payment.amount).replace('-', ''), payment.currency || doc.currency);
  const removable = payment.source !== 'BANK_IMPORT' && payment.method !== 'OFFSET';
  const actions = [{ label: t('common.close'), onClick: (m) => m.close() }];
  if (SALES.has(doc.kind) && EKASA_METHODS.includes(payment.method) && !ekasaExempt(state.company)) {
    actions.push({ label: t('bank.ekasa.title'), onClick: (m) => { m.close(); openEkasaDialog(docId, paymentId); } });
  }
  if (payment.offsetId) {
    actions.push({ label: t('offset.print'), onClick: () => printOffset(payment.offsetId) });
    actions.push({
      label: t('offset.cancel'), kind: 'danger', onClick: async (m) => {
        if (!canWrite(state)) return;
        if (!(await confirmDialog(t('offset.cancelConfirm', { number: payment.note || '' }), { danger: true }))) return;
        m.close();
        const ok = await guarded(async store => { await cancelOffsetProtocol(store, payment.offsetId); return true; });
        if (ok) showToast(t('offset.cancelled'), { type: 'success' });
      }
    });
  }
  if (removable) {
    actions.push({
      label: t('payments.remove'), kind: 'danger', onClick: async (m) => {
        if (!canWrite(state)) return;
        if (!(await confirmDialog(t('payments.removeConfirm', { amount, number: doc.number || '' }), { danger: true }))) return;
        m.close();
        const ok = await guarded(async store => { await removeManualPayment(store, docId, paymentId); return true; });
        if (ok) showToast(t('payments.removed'), { type: 'success' });
      }
    });
  }
  openModal({
    title: t('payments.actions', { number: doc.number || '' }),
    body: h('div', {},
      h('p', {}, `${day(payment.date)}: ${amount}, ${t(`payments.method.${payment.method}`)}`),
      payment.note ? h('p', { class: 'muted' }, payment.note) : null,
      payment.ekasaReceiptId ? h('p', { class: 'muted' }, `${t('bank.ekasa.receiptId')}: ${payment.ekasaReceiptId}`) : null,
      payment.ekasaOkp ? h('p', { class: 'muted' }, `${t('bank.ekasa.okp')}: ${payment.ekasaOkp}`) : null,
      payment.source === 'BANK_IMPORT' ? h('p', { class: 'field-hint' }, t('payments.removeBank')) : null),
    actions
  });
}
