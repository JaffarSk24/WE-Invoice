// A cash receipt or expense voucher by hand, and the actions of an existing
// one. The VAT choice (a rate, reverse charge, an exemption or no VAT) comes
// from legislation on the voucher date and is offered to a VAT payer only
// (voucher-vat.js). An expense that would take the balance below zero asks
// first unless the book allows it.
import { h } from '../../../ui/dom.js';
import { openModal, confirmDialog } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';
import { textField, amountField, dateField } from '../../../components/fields.js';
import { todayLocal } from '../../../components/dates.js';
import { checkCashOut } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { canWrite, guarded } from '../shared/write.js';
import { money, day } from '../shared/format.js';
import { createVoucher, cancelVoucher } from './operations.js';
import { voucherVatFields, vatChoiceLabel } from './voucher-vat.js';

/** Asks before an expense takes the balance below zero; true when it may go on. */
export async function negativeAllowed(book, documents, date, amount) {
  if (!book) return true;
  const check = checkCashOut(book, documents, { date, amount });
  if (!check.negative) return true;
  return confirmDialog(t('cash.negative', { amount: money(check.lowest, book.currency) }), { danger: true });
}

export function openVoucherDialog({ book, kind }) {
  const state = moneyState();
  if (!canWrite(state)) return;
  const date = dateField({ label: t('cash.voucher.date'), value: todayLocal(), required: true });
  const amount = amountField({ label: t('cash.voucher.amount'), currency: book.currency, required: true });
  const purpose = textField({ label: t('cash.voucher.purpose'), required: true });
  const vat = voucherVatFields({ state, kind, date: () => date.value() || todayLocal() });
  date.input.addEventListener('change', () => vat.refresh());
  openModal({
    title: t(`cash.kind.${kind}`),
    body: h('div', { class: 'form-grid voucher-form' }, date.el, amount.el, purpose.el, vat.els),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('common.save'), kind: 'primary', onClick: async (m) => {
          const value = amount.value();
          if (!value || Number(value) <= 0) { amount.setError(t('errors.AMOUNT_INVALID')); return; }
          if (!purpose.value()) { purpose.setError(t('cash.voucher.purposeRequired')); return; }
          if (!vat.validate()) return;
          const when = date.value() || todayLocal();
          if (kind === 'CASH_OUT' && !(await negativeAllowed(book, moneyState().documents, when, value))) return;
          m.close();
          const voucher = await guarded(store => createVoucher(store, {
            bookId: book.id, kind, date: when, amount: value, purpose: purpose.value(),
            partner: vat.partner(), contactId: vat.contactId(), vat: vat.vat(), ekasaSale: vat.ekasaSale()
          }));
          if (voucher) showToast(t('cash.voucher.saved', { number: voucher.number }), { type: 'success' });
        }
      }
    ]
  });
}

// The VAT of a voucher in words, for its actions dialog.
function voucherVatText(voucher) {
  const line = voucher.lines?.[0];
  if (!line || !line.vatCategory || line.vatCategory === 'O') return null;
  return vatChoiceLabel({ category: line.vatCategory, rate: line.vatRate });
}

export function openVoucherActions(voucherId) {
  const state = moneyState();
  const voucher = state.documents.find(d => d.id === voucherId);
  if (!voucher) return;
  const party = voucher.kind === 'CASH_IN' ? voucher.buyer : voucher.seller;
  openModal({
    title: `${t(`cash.kind.${voucher.kind}`)} ${voucher.number}`,
    body: h('div', {},
      h('p', {}, `${day(voucher.issueDate)}: ${money(voucher.totals?.payable, voucher.currency)}`),
      h('p', {}, voucher.lines?.[0]?.name || ''),
      voucherVatText(voucher) ? h('p', { class: 'muted' }, voucherVatText(voucher)) : null,
      voucher.ekasaSale ? h('p', { class: 'muted voucher-ekasa-mark' }, t('cash.voucher.ekasaSale')) : null,
      party?.name ? h('p', { class: 'muted' }, [party.name, party.icDph].filter(Boolean).join(', ')) : null),
    actions: [
      { label: t('common.close'), onClick: (m) => m.close() },
      {
        label: t('cash.voucher.cancel'), kind: 'danger', onClick: async (m) => {
          if (!canWrite(state)) return;
          if (!(await confirmDialog(t('cash.voucher.cancelConfirm', { number: voucher.number }), { danger: true }))) return;
          m.close();
          const ok = await guarded(async store => { await cancelVoucher(store, voucher.id); return true; });
          if (ok) showToast(t('cash.voucher.cancelled', { number: voucher.number }), { type: 'success' });
        }
      }
    ]
  });
}
