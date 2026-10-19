// Recording a payment by hand (03-features.md § 3.9): document, date,
// amount (the open amount by default), method. A cash payment goes
// through a cash book: its príjmový or výdavkový doklad is created with
// the payment, the B2B cash limit is checked as the user types, and a
// cash, card or on-site QR payment of a sale opens the eKasa helper.
import { h } from '../../../ui/dom.js';
import { openModal } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';
import { amountField, dateField, selectField, textField } from '../../../components/fields.js';
import { autocomplete } from '../../../components/autocomplete.js';
import { todayLocal } from '../../../components/dates.js';
import { toInputText } from '../../../components/decimal.js';
import { makePayment, addPayment, cashKindForPayment, ekasaNeeded, paymentParty, schema } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { canWrite, guarded } from '../shared/write.js';
import { money } from '../shared/format.js';
import { createVoucher } from '../cash/operations.js';
import { negativeAllowed } from '../cash/voucher-dialog.js';
import { allOpenDocuments, documentLabel } from './documents.js';
import { openEkasaDialog } from './ekasa-dialog.js';
import { limitWarning } from './limits.js';

const METHODS = schema.PAYMENT_METHODS.filter(m => m !== 'OFFSET');

export function openRecordDialog(ctx, { docId = null } = {}) {
  const state = moneyState();
  if (!canWrite(state)) return;
  const candidates = allOpenDocuments(state);
  let chosen = candidates.find(c => c.doc.id === docId) || null;
  const open = h('p', { class: 'field-hint' });
  const warning = h('p', { class: 'callout callout-danger', hidden: true });
  const date = dateField({ label: t('payments.form.date'), value: todayLocal(), required: true });
  const amount = amountField({ label: t('payments.form.amount'), value: chosen ? chosen.open : null, currency: chosen?.doc.currency || 'EUR', required: true, onChange: () => refresh() });
  const method = selectField({
    label: t('payments.form.method'), options: METHODS.map(m => ({ value: m, label: t(`payments.method.${m}`) })),
    value: chosen?.doc.paymentMethod && METHODS.includes(chosen.doc.paymentMethod) ? chosen.doc.paymentMethod : 'TRANSFER', onChange: () => refresh()
  });
  const books = selectField({ label: t('payments.form.cashBook'), options: state.cashBooks.map(b => ({ value: b.id, label: `${b.name} (${b.currency})` })) });
  const note = textField({ label: t('payments.form.note') });
  const picker = autocomplete({
    label: t('payments.form.document'), placeholder: t('bank.match.search'), value: chosen ? documentLabel(chosen) : '',
    search: (q) => candidates.filter(c => documentLabel(c).toLowerCase().includes(q.toLowerCase())).slice(0, 20)
      .map(c => ({ id: c.doc.id, label: documentLabel(c), hint: money(c.open, c.doc.currency) })),
    onPick: (item) => { chosen = candidates.find(c => c.doc.id === item.id) || null; if (chosen) amount.input.value = toInputText(chosen.open); refresh(); }
  });
  function refresh() {
    open.textContent = chosen ? t('payments.form.open', { amount: money(chosen.open, chosen.doc.currency) }) : '';
    books.el.hidden = method.value() !== 'CASH';
    const text = method.value() === 'CASH' ? limitWarning(state, chosen?.doc, amount.value(), date.value() || todayLocal()) : null;
    warning.hidden = !text;
    warning.textContent = text || '';
  }
  date.input.addEventListener('change', refresh);
  amount.input.addEventListener('input', refresh);
  refresh();

  const save = async (m) => {
    if (!chosen) { showToast(t('payments.form.docRequired'), { type: 'error' }); return; }
    const value = amount.value();
    if (!value || Number(value) <= 0) { amount.setError(t('errors.AMOUNT_INVALID')); return; }
    const when = date.value() || todayLocal();
    const cash = method.value() === 'CASH';
    const book = cash ? state.cashBooks.find(b => b.id === books.value()) : null;
    if (cash && !book) { showToast(t('payments.noCashBook'), { type: 'error' }); return; }
    const kind = cashKindForPayment(chosen.doc);
    if (cash && kind === 'CASH_OUT' && !(await negativeAllowed(book, state.documents, when, value))) return;
    m.close();
    const result = await guarded(async (store) => {
      const doc = store.get('documents', chosen.doc.id);
      const payment = makePayment(doc, { date: when, amount: value, method: method.value(), source: cash ? 'CASH' : 'MANUAL', cashBookId: book?.id || null, note: note.value() || null });
      await store.update('documents', doc.id, addPayment(doc, payment));
      const voucher = cash ? await createVoucher(store, {
        bookId: book.id, kind, date: when, amount: value, purpose: t('cash.voucher.purposePayment', { number: doc.number || '' }),
        partner: paymentParty(doc) ? { name: paymentParty(doc).name } : null, contactId: doc.contactId || null, paysDocId: doc.id, paymentId: payment.id
      }) : null;
      return { doc, payment, voucher };
    });
    if (!result) return;
    showToast(t('payments.saved', { amount: money(result.payment.amount.replace('-', ''), result.payment.currency) }), { type: 'success' });
    if (result.voucher) showToast(t('payments.voucherCreated', { number: result.voucher.number }), { type: 'info' });
    if (ekasaNeeded(result.doc, result.payment, state.company)) openEkasaDialog(result.doc.id, result.payment.id);
  };

  openModal({
    title: t('payments.record'),
    body: h('div', { class: 'form-grid' }, chosen ? h('p', {}, h('strong', {}, documentLabel(chosen))) : picker.el, open, date.el, amount.el, method.el, books.el, note.el, warning),
    actions: [
      { label: t('common.cancel'), onClick: (mm) => mm.close() },
      { label: t('common.save'), kind: 'primary', onClick: save }
    ]
  });
  if (!candidates.length) showToast(t('payments.noOpenDocs'), { type: 'info' });
}
