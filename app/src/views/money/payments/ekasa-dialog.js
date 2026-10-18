// "Vystaviť doklad eKasa" (12-risks § 12.3, stage 1): the invoice number
// and the amount to copy into VRP2, a plain link to the financial
// administration's site, the reminder to issue it without undue delay and
// fields for the receipt ID and OKP the user types back. No call, script
// or deep link to VRP2: the law forbids other client environments.
import { h } from '../../../ui/dom.js';
import { openModal } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';
import { textField } from '../../../components/fields.js';
import { ekasaManualEntry } from '@we-invoice/core';
import { moneyState, contactMap } from '../shared/data.js';
import { canWrite, guarded } from '../shared/write.js';
import { money, copyText } from '../shared/format.js';
import { limitWarning } from './limits.js';

function copyRow(label, shown, value) {
  return h('div', { class: 'copy-row' },
    h('span', { class: 'muted' }, label), h('strong', {}, shown),
    h('button', { type: 'button', class: 'btn btn-sm', onclick: () => copyText(value) }, t('bank.ekasa.copy')));
}

function vatBlock(entry) {
  if (entry.invoicePayment || !entry.vatLines.length) return h('p', { class: 'field-hint' }, t('bank.ekasa.invoiceRule'));
  return h('div', {}, h('h4', {}, t('bank.ekasa.vatLines')),
    entry.vatLines.map(l => copyRow(l.rate ? `${l.rate} %` : t('cash.voucher.noVat'),
      l.rate ? t('bank.ekasa.vatLine', { rate: l.rate, base: money(l.base, entry.currency), vat: money(l.vat, entry.currency), gross: money(l.gross, entry.currency) })
        : t('bank.ekasa.vatNone', { gross: money(l.gross, entry.currency) }),
      l.gross)));
}

export function openEkasaDialog(docId, paymentId) {
  const state = moneyState();
  const doc = state.documents.find(d => d.id === docId);
  const payment = doc?.payments?.find(p => p.id === paymentId);
  if (!doc || !payment) return;
  const entry = ekasaManualEntry(doc, payment, state.company, contactMap(state).get(doc.contactId) || null);
  const receipt = textField({ label: t('bank.ekasa.receiptId'), value: payment.ekasaReceiptId || '' });
  const okp = textField({ label: t('bank.ekasa.okp'), value: payment.ekasaOkp || '' });
  const limit = payment.method === 'CASH' ? limitWarning(state, { ...doc, payments: doc.payments.filter(p => p.id !== paymentId) }, entry.amount, payment.date) : null;
  openModal({
    title: t('bank.ekasa.title'),
    body: h('div', { class: 'ekasa-body' },
      h('p', {}, t('bank.ekasa.text')),
      limit ? h('p', { class: 'callout callout-danger' }, limit) : null,
      entry.invoiceNumber ? copyRow(t('bank.ekasa.invoiceNumber'), entry.invoiceNumber, entry.invoiceNumber) : null,
      copyRow(t('bank.ekasa.amount'), money(entry.amount, entry.currency), entry.amount.replace('.', ',')),
      vatBlock(entry),
      entry.vrp2Url ? h('p', {}, h('a', { href: entry.vrp2Url, target: '_blank', rel: 'noopener noreferrer', class: 'btn' }, t('bank.ekasa.open'))) : null,
      h('p', { class: 'field-hint' }, t('bank.ekasa.manualOnly', { law: entry.law || '' })),
      h('div', { class: 'form-grid' }, receipt.el, okp.el)),
    actions: [
      { label: t('bank.ekasa.later'), onClick: (m) => m.close() },
      {
        label: t('common.save'), kind: 'primary', onClick: async (m) => {
          if (!canWrite(state)) return;
          m.close();
          const ok = await guarded(async (store) => {
            const fresh = store.get('documents', docId);
            const payments = fresh.payments.map(p => (p.id === paymentId ? { ...p, ekasaReceiptId: receipt.value() || null, ekasaOkp: okp.value() || null } : p));
            await store.update('documents', docId, { payments });
            return true;
          });
          if (ok) showToast(t('bank.ekasa.saved'), { type: 'success' });
        }
      }
    ]
  });
}
