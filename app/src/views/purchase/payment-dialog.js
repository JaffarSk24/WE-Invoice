// The dialog that records a payment of a received document: date, amount
// (the amount still due by default) and method. Payments from bank
// statements are matched by WP-BANK on VS, IBAN and amount; this is the
// manual way.
import { amountDue, parseAmount, schema } from '@we-invoice/core';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { openModal } from '../../ui/modal.js';
import { dateField, textField, selectField } from '../../components/fields.js';
import { amountText } from './amount-text.js';

export function openPaymentDialog(doc, { today, onSave }) {
  const date = dateField({ label: t('purchase.payment.date'), value: today, required: true });
  const amount = textField({ label: t('purchase.payment.amount'), value: amountText(amountDue(doc)), required: true, attrs: { inputmode: 'decimal', class: 'num' } });
  const method = selectField({
    label: t('purchase.field.paymentMethod'), value: doc.paymentMethod || 'TRANSFER',
    options: schema.PAYMENT_METHODS.map(m => ({ value: m, label: t(`purchase.paymentMethod.${m}`) }))
  });
  openModal({
    title: t('purchase.payment.title'),
    body: h('div', { class: 'form-grid' }, date.el, amount.el, method.el),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('purchase.payment.save'), kind: 'primary',
        onClick: async (m) => {
          const value = parseAmount(amount.input.value);
          amount.setError(value === null || !/[1-9]/.test(value) ? t('purchase.error.amount') : '');
          date.setError(date.value() ? '' : t('purchase.error.required'));
          if (value === null || !/[1-9]/.test(value) || !date.value()) return;
          if (await onSave({ date: date.value(), amount: value, method: method.value() })) m.close();
        }
      }
    ]
  });
}
