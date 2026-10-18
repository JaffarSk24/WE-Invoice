// Advance deduction in a final invoice (03-features.md § 3.6.2): the paid
// proformas and tax documents to received payments of the client, each
// deducted in full or in part. The links are ADVANCE_DEDUCTION with the
// amount; computeTotals turns them into the prepaid amount (BT-113).
import { cmp, round } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { formatAmount, parseDecimal, toInputText } from '../../components/decimal.js';
import { formatDate } from '../../components/dates.js';
import { deductionCandidates, advanceAvailable } from './convert.js';

/** The links of a draft with one advance deduction set (amount null removes it). */
export function withDeduction(links, docId, amount) {
  const rest = (links || []).filter(l => !(l.kind === 'ADVANCE_DEDUCTION' && l.docId === docId));
  return amount ? [...rest, { kind: 'ADVANCE_DEDUCTION', docId, amount: round(amount, 2) }] : rest;
}

/**
 * @param {{draft: object, documents: Array, onDraft: Function}} ctx
 * @returns {HTMLElement|null} null for kinds that deduct nothing
 */
export function advancesPanel(ctx) {
  const { draft, documents } = ctx;
  if (draft.kind !== 'INVOICE') return null;
  const deducted = (draft.links || []).filter(l => l.kind === 'ADVANCE_DEDUCTION');
  const candidates = deductionCandidates(documents, { contactId: draft.contactId, currency: draft.currency, exceptId: draft.id })
    .filter(d => !deducted.some(l => l.docId === d.id));
  if (!deducted.length && !candidates.length) return null;
  const currency = draft.currency || 'EUR';
  const set = (links) => ctx.onDraft({ links }, { redraw: 'all' });

  const rows = deducted.map(link => {
    const doc = documents.find(d => d.id === link.docId);
    const max = doc ? advanceAvailable(doc, documents, draft.id) : link.amount;
    const input = h('input', { type: 'text', inputmode: 'decimal', class: 'num', value: toInputText(link.amount), 'aria-label': t('documents.advances.amount') });
    const error = h('span', { class: 'line-error', role: 'alert', hidden: true });
    input.addEventListener('change', () => {
      const parsed = parseDecimal(input.value);
      if (parsed === null || cmp(parsed, '0') <= 0 || cmp(parsed, max) > 0) {
        error.textContent = t('documents.advances.invalid', { max: formatAmount(max, currency) });
        error.hidden = false;
        return;
      }
      error.hidden = true;
      set(withDeduction(draft.links, link.docId, parsed));
    });
    return h('li', { class: 'advance-row' },
      h('span', {}, doc ? `${t(`document.kind.${doc.kind}`)} ${doc.number}` : link.docId),
      input,
      h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': t('documents.advances.remove'), onclick: () => set(withDeduction(draft.links, link.docId, null)) }, icon('x')),
      error);
  });
  const offers = candidates.map(doc => h('li', { class: 'advance-row' },
    h('span', {}, `${t(`document.kind.${doc.kind}`)} ${doc.number} · ${formatDate(doc.issueDate)}`),
    h('span', { class: 'num' }, formatAmount(advanceAvailable(doc, documents, draft.id), currency)),
    h('button', { type: 'button', class: 'btn btn-sm', onclick: () => set(withDeduction(draft.links, doc.id, advanceAvailable(doc, documents, draft.id))) }, icon('plus'), t('documents.advances.deduct'))));

  return h('section', { class: 'editor-advances card', 'aria-labelledby': 'editor-advances-title' },
    h('h2', { id: 'editor-advances-title' }, t('documents.advances.title')),
    rows.length ? h('ul', { class: 'advance-list' }, rows) : null,
    offers.length ? h('div', {}, h('p', { class: 'muted small' }, t('documents.advances.available')), h('ul', { class: 'advance-list' }, offers)) : null);
}
