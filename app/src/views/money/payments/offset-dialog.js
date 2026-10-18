// Zápočet with one party: its open receivables and payables in one
// currency, the amount (the largest possible by default) and the date.
// Confirming stores the protocol and the OFFSET payments; the agreement
// prints through the browser's print window.
import { h, clear } from '../../../ui/dom.js';
import { openModal } from '../../../ui/modal.js';
import { t } from '../../../i18n/index.js';
import { showToast } from '../../../ui/toast.js';
import { amountField, dateField } from '../../../components/fields.js';
import { todayLocal } from '../../../components/dates.js';
import { toInputText } from '../../../components/decimal.js';
import { offsetCandidates, planOffset, buildOffset, cmp } from '@we-invoice/core';
import { moneyState } from '../shared/data.js';
import { canWrite, guarded, patchDocuments } from '../shared/write.js';
import { money } from '../shared/format.js';
import { printOffset } from './offset-print.js';

/** Parties with something open on both sides, per currency. */
export function offsetPartners(state) {
  const out = [];
  for (const contact of state.contacts) {
    const currencies = new Set(state.documents.filter(d => d.contactId === contact.id).map(d => d.currency || 'EUR'));
    for (const currency of currencies) {
      const c = offsetCandidates(state.documents, contact.id, currency);
      if (c.receivables.length && c.payables.length) out.push({ contact, currency, candidates: c });
    }
  }
  return out;
}

async function storeOffset(store, { contact, currency, amount, date }) {
  const documents = store.list('documents');
  const plan = planOffset(documents, { contactId: contact.id, currency, amount });
  // The next free number of the year: numbers in use (deleted ones too) are skipped.
  const taken = store.list('documents', { includeDeleted: true }).filter(d => d.kind === 'INTERNAL' && d.offset).map(d => d.number);
  const result = buildOffset(documents, { plan, date, contact, taken });
  await store.insert('documents', result.protocol);
  await patchDocuments(store, result.documents);
  return result.protocol;
}

function sideTable(list, currency) {
  return h('ul', { class: 'plain-list' }, list.map(c => h('li', {}, `${c.doc.number || c.doc.id}: ${money(c.open, currency)}`)));
}

export function openOffsetDialog() {
  const state = moneyState();
  if (!canWrite(state)) return;
  const partners = offsetPartners(state);
  if (!partners.length) { showToast(t('offset.noPartners'), { type: 'info' }); return; }
  let current = partners[0];
  const details = h('div', {});
  const date = dateField({ label: t('offset.date'), value: todayLocal(), required: true });
  const amount = amountField({ label: t('offset.amount'), value: current.candidates.possible, currency: current.currency, required: true });
  const draw = () => {
    clear(details);
    const c = current.candidates;
    amount.input.value = toInputText(c.possible);
    details.append(h('h4', {}, t('offset.receivables')), sideTable(c.receivables, current.currency),
      h('h4', {}, t('offset.payables')), sideTable(c.payables, current.currency),
      h('p', { class: 'field-hint' }, t('offset.max', { amount: money(c.possible, current.currency) })));
  };
  const select = h('select', { 'aria-label': t('offset.contact'), onchange: (e) => { current = partners[Number(e.target.value)]; draw(); } },
    partners.map((p, i) => h('option', { value: String(i) }, `${p.contact.name} (${p.currency})`)));
  draw();
  openModal({
    title: t('offset.title'), wide: true,
    body: h('div', { class: 'form-grid' }, h('label', { class: 'field' }, h('span', {}, t('offset.contact')), select), details, amount.el, date.el),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('offset.create'), kind: 'primary', onClick: async (m) => {
          const value = amount.value();
          if (!value || cmp(value, '0') <= 0 || cmp(value, current.candidates.possible) > 0) { amount.setError(t('errors.OFFSET_AMOUNT_INVALID')); return; }
          m.close();
          const protocol = await guarded(store => storeOffset(store, { contact: current.contact, currency: current.currency, amount: value, date: date.value() || todayLocal() }));
          if (!protocol) return;
          showToast(t('offset.done', { number: protocol.number, amount: money(value, current.currency) }), {
            type: 'success', actionLabel: t('offset.print'), onAction: () => printOffset(protocol.id), duration: 10000
          });
        }
      }
    ]
  });
}
