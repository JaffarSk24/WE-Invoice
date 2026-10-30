// Editing a payment recorded by hand: date, amount, method, cash book and
// note, saved over the same payment (core replacePayment), so the
// document's status follows. A cash voucher stays only while it still
// says the same: when the payment stops being cash, or its amount, date
// or cash book changes, the old voucher is cancelled and a new one issued,
// as a cash book cannot be rewritten. Payments from a bank statement and
// offsets are not edited here (actions-dialog.js).
import { h } from '../../../ui/dom.js';
import { openModal } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';
import { amountField, dateField, selectField, textField } from '../../../components/fields.js';
import { amountDue, replacePayment, cashKindForPayment, ekasaNeeded, paymentParty, abs, round, schema } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { canWrite, guarded } from '../shared/write.js';
import { money } from '../shared/format.js';
import { createVoucher } from '../cash/operations.js';
import { negativeAllowed } from '../cash/voucher-dialog.js';
import { documentLabel } from './documents.js';
import { openEkasaDialog } from './ekasa-dialog.js';
import { limitWarning } from './limits.js';

const METHODS = schema.PAYMENT_METHODS.filter(m => m !== 'OFFSET');

/** Whether the voucher of a cash payment no longer matches the edited one. */
export function voucherOutdated(old, next) {
  if (old.method !== 'CASH') return next.method === 'CASH';
  return next.method !== 'CASH' || old.date !== next.date || old.amount !== next.amount || old.cashBookId !== next.cashBookId;
}

/** Saves an edited payment and keeps its cash voucher in step. */
export async function saveEditedPayment(store, docId, paymentId, input, { purpose }) {
  const doc = store.get('documents', docId);
  const old = doc.payments.find(p => p.id === paymentId);
  const cash = input.method === 'CASH';
  const source = cash ? 'CASH' : (old.source === 'CASH' ? 'MANUAL' : old.source);
  const keepEkasa = input.method === old.method;
  const patch = replacePayment(doc, paymentId, {
    ...input, source, cashBookId: cash ? input.cashBookId : null,
    ekasaReceiptId: keepEkasa ? old.ekasaReceiptId : null, ekasaOkp: keepEkasa ? old.ekasaOkp : null
  });
  const payment = patch.payments.find(p => p.id === paymentId);
  await store.update('documents', docId, patch);
  let voucher = null;
  if (voucherOutdated(old, payment)) {
    const previous = store.list('documents').find(d => d.paymentId === paymentId && d.paysDocId === docId && d.status !== 'CANCELLED');
    if (previous) await store.update('documents', previous.id, { status: 'CANCELLED' });
    if (cash && input.cashBookId) {
      voucher = await createVoucher(store, {
        bookId: input.cashBookId, kind: cashKindForPayment(doc), date: payment.date, amount: round(abs(payment.amount), 2), purpose,
        partner: paymentParty(doc) ? { name: paymentParty(doc).name } : null, contactId: doc.contactId || null, paysDocId: doc.id, paymentId
      });
    }
  }
  return { doc: { ...doc, ...patch }, payment, voucher };
}

export function openEditDialog(ctx, docId, paymentId) {
  const state = moneyState();
  if (!canWrite(state)) return;
  const doc = state.documents.find(d => d.id === docId);
  const old = doc?.payments?.find(p => p.id === paymentId);
  if (!old) return;
  const others = { ...doc, payments: doc.payments.filter(p => p.id !== paymentId) };
  const open = round(abs(amountDue(others)), 2);
  const warning = h('p', { class: 'callout callout-danger', hidden: true });
  const date = dateField({ label: t('payments.form.date'), value: old.date, required: true });
  const amount = amountField({ label: t('payments.form.amount'), value: round(abs(old.amount), 2), currency: old.currency || doc.currency, required: true, onChange: () => refresh() });
  const method = selectField({
    label: t('payments.form.method'), options: METHODS.map(m => ({ value: m, label: t(`payments.method.${m}`) })),
    value: METHODS.includes(old.method) ? old.method : 'TRANSFER', onChange: () => refresh()
  });
  // A cash payment of a received document may have no cash book (purchase
  // screen): it can stay without one and without a voucher.
  const bookless = old.method === 'CASH' && !old.cashBookId;
  const bookOptions = state.cashBooks.map(b => ({ value: b.id, label: `${b.name} (${b.currency})` }));
  const books = selectField({ label: t('payments.form.cashBook'), options: bookless ? [{ value: '', label: t('payments.form.noCashBook') }, ...bookOptions] : bookOptions, value: old.cashBookId || '' });
  const note = textField({ label: t('payments.form.note'), value: old.note || '' });
  function refresh() {
    books.el.hidden = method.value() !== 'CASH';
    const text = method.value() === 'CASH' ? limitWarning(state, doc, amount.value(), date.value() || old.date) : null;
    warning.hidden = !text;
    warning.textContent = text || '';
  }
  date.input.addEventListener('change', refresh);
  amount.input.addEventListener('input', refresh);
  refresh();

  const save = async (m) => {
    const value = amount.value();
    if (!value || Number(value) <= 0) { amount.setError(t('errors.AMOUNT_INVALID')); return; }
    const when = date.value() || old.date;
    const cash = method.value() === 'CASH';
    const book = cash ? state.cashBooks.find(b => b.id === books.value()) : null;
    if (cash && !book && !bookless) { showToast(t('payments.noCashBook'), { type: 'error' }); return; }
    const input = { date: when, amount: value, method: method.value(), cashBookId: book?.id || null, note: note.value() || null };
    const newVoucher = cash && voucherOutdated({ ...old, amount: round(abs(old.amount), 2) }, { ...input, amount: round(value, 2) });
    if (newVoucher && cashKindForPayment(doc) === 'CASH_OUT' && !(await negativeAllowed(book, state.documents, when, value))) return;
    m.close();
    const result = await guarded(store => saveEditedPayment(store, docId, paymentId, input, { purpose: t('cash.voucher.purposePayment', { number: doc.number || '' }) }));
    if (!result) return;
    showToast(t('payments.updated'), { type: 'success' });
    if (result.voucher) showToast(t('payments.voucherCreated', { number: result.voucher.number }), { type: 'info' });
    if (result.payment.method !== old.method && ekasaNeeded(result.doc, result.payment, state.company)) openEkasaDialog(docId, paymentId);
  };

  openModal({
    title: t('payments.edit'),
    body: h('div', { class: 'form-grid' }, h('p', {}, h('strong', {}, documentLabel(doc))),
      h('p', { class: 'field-hint' }, t('payments.form.open', { amount: money(open, doc.currency) })),
      date.el, amount.el, method.el, books.el, note.el, warning),
    actions: [
      { label: t('common.cancel'), onClick: (mm) => mm.close() },
      { label: t('common.save'), kind: 'primary', onClick: save }
    ]
  });
}
