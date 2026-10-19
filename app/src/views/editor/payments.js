// Payments of a document (03-features.md § 3.6.2 "Pridať úhradu"): the
// dialog that records one (amount, date, method, note; partial payments
// allowed), the history with removal by Undo, and for cash, card and
// on-site QR payments the eKasa screen. A cash payment between businesses
// above the legal limit is warned about before it is saved.
import { schema, amountDue, cmp, isZero } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { openModal } from '../../ui/modal.js';
import { amountField, dateField, selectField, textField } from '../../components/fields.js';
import { formatAmount } from '../../components/decimal.js';
import { formatDate, todayLocal } from '../../components/dates.js';
import { openEkasaScreen, needsEkasa, overCashLimit, cashLimit } from './ekasa.js';

const isB2b = (doc) => Boolean(doc.buyer && (doc.buyer.ico || doc.buyer.icDph));

/** Errors of the payment form (i18n keys by field). */
export function validatePayment({ amount, date }) {
  const errors = {};
  if (amount === null || cmp(amount, '0') <= 0) errors.amount = 'documents.payments.errors.amount';
  if (!date) errors.date = 'documents.payments.errors.date';
  return errors;
}

/**
 * @param {{doc: object, company: object, onSave: Function, onReceipt: Function}} ctx
 *   onSave(payment) stores and returns the payment; onReceipt(paymentId, fields) stores the eKasa id
 */
export function openPaymentDialog(ctx) {
  const { doc, company } = ctx;
  const due = amountDue(doc);
  const currency = doc.currency || 'EUR';
  const amount = amountField({ label: t('documents.payments.amount'), value: cmp(due, '0') > 0 ? due : null, currency, required: true, attrs: { id: 'payment-amount' } });
  const date = dateField({ label: t('documents.payments.date'), value: todayLocal(), required: true, attrs: { id: 'payment-date' } });
  const method = selectField({
    label: t('documents.payments.method'), value: doc.paymentMethod || 'TRANSFER', attrs: { id: 'payment-method' },
    options: schema.PAYMENT_METHODS.map(m => ({ value: m, label: t(`documents.payment.method.${m}`) }))
  });
  const note = textField({ label: t('documents.payments.note') });
  const limit = cashLimit(todayLocal());
  const warning = h('p', { class: 'callout callout-warning small', hidden: true, role: 'alert' }, limit ? t('documents.payments.cashLimit', { limit: formatAmount(limit.amount, 'EUR'), law: limit.law }) : '');
  const checkLimit = () => { warning.hidden = !overCashLimit({ amount: amount.value() || '0', method: method.value(), b2b: isB2b(doc), date: date.value() || todayLocal() }); };
  [amount.input, method.input, date.input].forEach(el => el.addEventListener('change', checkLimit));
  const ekasaHint = h('p', { class: 'muted small', hidden: !needsEkasa(company, method.value()) }, t('documents.payments.ekasaHint'));
  method.input.addEventListener('change', () => { ekasaHint.hidden = !needsEkasa(company, method.value()); });

  openModal({
    title: t('documents.payments.addTitle', { number: doc.number || '' }),
    body: h('div', { class: 'form-grid payment-form' },
      h('p', { class: 'muted small' }, t('documents.payments.due', { amount: formatAmount(due, currency) })),
      amount.el, date.el, method.el, note.el, warning, ekasaHint),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('documents.payments.save'), kind: 'primary', onClick: async (m) => {
          const values = { amount: amount.value(), date: date.value(), method: method.value(), note: note.value() || null };
          const errors = validatePayment(values);
          amount.setError(errors.amount ? t(errors.amount) : null);
          date.setError(errors.date ? t(errors.date) : null);
          if (Object.keys(errors).length) return;
          const payment = await ctx.onSave(values);
          m.close();
          if (payment && needsEkasa(company, payment.method)) {
            openEkasaScreen({ doc, payment, onReceipt: (fields) => ctx.onReceipt(payment.id, fields) });
          }
        }
      }
    ]
  });
}

/**
 * The payment history of a document.
 * @param {{doc: object, company: object, onRemove: Function, onReceipt: Function, readOnly: boolean}} ctx
 */
export function paymentsCard(ctx) {
  const { doc } = ctx;
  const payments = (doc.payments || []).filter(p => !p.deleted).sort((a, b) => (a.date < b.date ? -1 : 1));
  const currency = doc.currency || 'EUR';
  const rows = payments.map(p => h('li', { class: 'payment-row', dataset: { paymentId: p.id } },
    h('span', {}, formatDate(p.date)),
    h('span', { class: 'num' }, formatAmount(p.amount, p.currency || currency)),
    h('span', {}, t(`documents.payment.method.${p.method}`)),
    p.ekasaReceiptId ? h('span', { class: 'muted small' }, t('documents.payments.ekasaId', { id: p.ekasaReceiptId })) : null,
    p.note ? h('span', { class: 'muted small' }, p.note) : null,
    h('span', { class: 'payment-tools' },
      needsEkasa(ctx.company, p.method) && !ctx.readOnly
        ? h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openEkasaScreen({ doc, payment: p, onReceipt: (fields) => ctx.onReceipt(p.id, fields) }) }, icon('receipt'), t('documents.payments.ekasa'))
        : null,
      ctx.readOnly ? null : h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': t('documents.payments.remove'), onclick: () => ctx.onRemove(p) }, icon('trash-2')))));
  const due = amountDue(doc);
  return h('section', { class: 'card detail-payments', 'aria-labelledby': 'detail-payments-title' },
    h('h2', { id: 'detail-payments-title' }, t('documents.payments.title')),
    rows.length ? h('ul', { class: 'payment-list' }, rows) : h('p', { class: 'muted' }, t('documents.payments.none')),
    h('p', { class: 'payment-due' }, isZero(due) ? t('documents.payments.settled') : t('documents.payments.due', { amount: formatAmount(due, currency) })));
}
