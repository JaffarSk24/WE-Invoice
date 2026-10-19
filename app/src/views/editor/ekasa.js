// eKasa stage 1 (12-risks § 12.3): a cash, card or on-site QR payment of
// an invoice needs an eKasa receipt "úhrada faktúry", issued without undue
// delay. Integrating VRP2 is forbidden by § 5 ods. 6 zákona 384/2025 Z. z.,
// so this screen only helps: the invoice number and the amount with copy
// buttons, the link to the official VRP2 page, and the field for the
// receipt id the user types back. Item lines and the VAT breakdown are
// not shown on purpose: the receipt must not contain them.
import { getLegislation, cmp, ekasaExempt } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { openModal } from '../../ui/modal.js';
import { showToast } from '../../ui/toast.js';
import { textField } from '../../components/fields.js';
import { formatAmount, toInputText } from '../../components/decimal.js';
import { formatDate } from '../../components/dates.js';

export const EKASA_METHODS = Object.freeze(['CASH', 'CARD', 'QR_ON_SITE']);

/** Whether a payment needs the eKasa screen: a cash, card or on-site QR payment, unless the company is exempt. */
export function needsEkasa(company, method) {
  return EKASA_METHODS.includes(method) && !ekasaExempt(company);
}

/** The VRP2 address from legislation, or null. */
export function vrp2Url(date) {
  try {
    return getLegislation('ekasa.vrp2Url', date);
  } catch (e) {
    console.warn('eKasa parameters are not available for the date', e);
    return null;
  }
}

/** The cash payment limit between businesses on a date ({ amount, law }), or null. */
export function cashLimit(date) {
  try {
    return getLegislation('cashPaymentLimitB2b', date);
  } catch (e) {
    console.warn('Cash limit is not available for the date', e);
    return null;
  }
}

/** True when a cash payment between businesses is above the legal limit. */
export function overCashLimit({ amount, method, b2b, date }) {
  if (method !== 'CASH' || !b2b) return false;
  const limit = cashLimit(date);
  return Boolean(limit) && cmp(amount, limit.amount) > 0;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(t('documents.ekasa.copied', { text }), { type: 'success' });
  } catch (e) {
    console.warn('Clipboard is not available', e);
    showToast(t('documents.ekasa.copyFailed'), { type: 'error' });
  }
}

function copyRow(label, value, id) {
  return h('div', { class: 'ekasa-row' },
    h('span', { class: 'ekasa-label' }, label),
    h('span', { class: 'ekasa-value num', id }, value),
    h('button', { type: 'button', class: 'btn btn-sm', onclick: () => copy(value) }, icon('copy'), t('documents.ekasa.copy')));
}

/**
 * @param {{doc: object, payment: object, onReceipt: Function}} input
 *   onReceipt({ ekasaReceiptId, ekasaOkp }) stores what the user typed
 */
export function openEkasaScreen({ doc, payment, onReceipt }) {
  const url = vrp2Url(payment.date);
  const amountText = toInputText(payment.amount);
  const receipt = textField({ label: t('documents.ekasa.receiptId'), value: payment.ekasaReceiptId || '', attrs: { id: 'ekasa-receipt-id', maxlength: '100' } });
  const okp = textField({ label: t('documents.ekasa.okp'), value: payment.ekasaOkp || '', attrs: { maxlength: '100' } });
  const body = h('div', { class: 'ekasa-screen' },
    h('p', {}, t('documents.ekasa.intro')),
    copyRow(t('documents.ekasa.invoiceNumber'), doc.number || '', 'ekasa-number'),
    copyRow(t('documents.ekasa.amount', { currency: payment.currency || doc.currency || 'EUR' }), amountText, 'ekasa-amount'),
    h('p', { class: 'muted small' }, t('documents.ekasa.summary', { method: t(`documents.payment.method.${payment.method}`), date: formatDate(payment.date), total: formatAmount(payment.amount, payment.currency || doc.currency || 'EUR') })),
    url ? h('a', { href: url, target: '_blank', rel: 'noopener', class: 'btn btn-primary', id: 'ekasa-open-vrp2' }, icon('external-link'), t('documents.ekasa.openVrp2')) : null,
    h('p', { class: 'callout callout-warning small' }, t('documents.ekasa.withoutDelay')),
    h('p', { class: 'muted small' }, t('documents.ekasa.noLines')),
    receipt.el, okp.el);
  openModal({
    title: t('documents.ekasa.title'), body, wide: true,
    actions: [
      { label: t('documents.ekasa.later'), onClick: (m) => m.close() },
      { label: t('common.save'), kind: 'primary', onClick: async (m) => { await onReceipt({ ekasaReceiptId: receipt.value() || null, ekasaOkp: okp.value() || null }); m.close(); } }
    ]
  });
}
