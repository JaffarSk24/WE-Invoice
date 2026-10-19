// A cash receipt or expense voucher by hand, and the actions of an existing
// one. VAT rates come from legislation on the voucher date (only offered
// to a VAT payer). An expense that would take the balance below zero asks
// first unless the book allows it.
import { h } from '../../../ui/dom.js';
import { openModal, confirmDialog } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';
import { textField, amountField, dateField, selectField } from '../../../components/fields.js';
import { todayLocal } from '../../../components/dates.js';
import { checkCashOut, vatRatesOn } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { canWrite, guarded } from '../shared/write.js';
import { money, day } from '../shared/format.js';
import { createVoucher, cancelVoucher } from './operations.js';

function vatOptions(company, date) {
  if (company.vatMode !== 'PAYER') return null;
  let rates = [];
  try {
    rates = vatRatesOn(date || todayLocal());
  } catch (e) {
    console.warn('No VAT rates on the date', e);
  }
  return [{ value: '', label: t('cash.voucher.noVat') }, ...rates.map(r => ({ value: r.rate, label: `${r.rate} %` }))];
}

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
  const partner = textField({ label: t(kind === 'CASH_IN' ? 'cash.voucher.partnerIn' : 'cash.voucher.partnerOut') });
  const options = vatOptions(state.company, todayLocal());
  const vat = options ? selectField({ label: t('cash.voucher.vatRate'), options, value: '' }) : null;
  openModal({
    title: t(`cash.kind.${kind}`),
    body: h('div', { class: 'form-grid' }, date.el, amount.el, purpose.el, partner.el, vat ? vat.el : null),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('common.save'), kind: 'primary', onClick: async (m) => {
          const value = amount.value();
          if (!value || Number(value) <= 0) { amount.setError(t('errors.AMOUNT_INVALID')); return; }
          if (!purpose.value()) { purpose.setError(t('cash.voucher.purposeRequired')); return; }
          const when = date.value() || todayLocal();
          if (kind === 'CASH_OUT' && !(await negativeAllowed(book, moneyState().documents, when, value))) return;
          m.close();
          const voucher = await guarded(store => createVoucher(store, {
            bookId: book.id, kind, date: when, amount: value, purpose: purpose.value(),
            partner: partner.value() ? { name: partner.value() } : null, vatRate: vat && vat.value() ? vat.value() : null
          }));
          if (voucher) showToast(t('cash.voucher.saved', { number: voucher.number }), { type: 'success' });
        }
      }
    ]
  });
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
      party?.name ? h('p', { class: 'muted' }, party.name) : null),
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
