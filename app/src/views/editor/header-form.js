// The head of a document in the editor: series and the number it will
// get (an issued document's number may be edited, never to one another
// document of the series has; a variable symbol made from the old number
// follows the new one), the dates (issue, supply, due, valid until), the correction of a
// credit or debit note (the corrected invoice and the reason) and the
// buyer's references (order BT-13, contract BT-12). Each field reports
// its change; errors from the particulars check land at the field.
import { isTaxDocument, isPayable, vsFromNumber } from '@we-invoice/core';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { dateField, selectField, textField, textArea } from '../../components/fields.js';
import { formatDate } from '../../components/dates.js';
import { seriesOfKind, previewNumber, takenNumbers, resolveSeries } from '../documents/series.js';
import { CORRECTION_KINDS, correctionCandidates } from './convert.js';

/**
 * @param {{draft: object, company: object, documents: Array, onDraft: Function, onIssueDate: Function}} ctx
 * @returns {{el: HTMLElement, errors: Object<string, Function>, refreshNumber: Function}}
 */
export function headerForm(ctx) {
  const { draft, company } = ctx;
  const errors = {};
  const fields = [];
  const set = (patch) => ctx.onDraft(patch, { redraw: false });

  const numberText = h('span', { class: 'number-preview num', id: 'editor-number-preview' });
  const refreshNumber = (doc) => {
    if (doc.number) { numberText.textContent = doc.number; return; }
    const { series } = resolveSeries(company, doc.kind, doc.seriesId);
    const preview = previewNumber(series, doc.issueDate || doc.createdAt.slice(0, 10), takenNumbers(ctx.documents, series.id));
    numberText.textContent = preview ? t('documents.editor.numberPreview', { number: preview }) : t('documents.editor.numberUnknown');
  };
  const own = seriesOfKind(company, draft.kind);
  if (own.length > 1 && !draft.number) {
    const series = selectField({
      label: t('documents.editor.series'), value: draft.seriesId || own[0].id,
      options: own.map(s => ({ value: s.id, label: s.name ? `${s.name} (${s.mask})` : s.mask })),
      onChange: (id) => ctx.onDraft({ seriesId: id }, { redraw: false, number: true })
    });
    fields.push(series.el);
  }
  if (draft.number) {
    let current = draft.number;
    const number = textField({ label: t('documents.editor.number'), value: draft.number, required: true, attrs: { id: 'editor-number', maxlength: '40', class: 'num' } });
    number.input.addEventListener('change', () => {
      const value = number.value();
      if (!value) { number.setError(t('documents.editor.errors.numberEmpty')); return; }
      const taken = (ctx.documents || []).some(d => !d.deleted && d.id !== draft.id && d.seriesId === draft.seriesId && d.number === value);
      if (taken) { number.setError(t('documents.editor.errors.numberTaken')); return; }
      number.setError(null);
      const patch = { number: value };
      const vsInput = document.getElementById('editor-vs');
      if (vsInput && vsInput.value === vsFromNumber(current)) {
        patch.vs = vsFromNumber(value) || null;
        vsInput.value = patch.vs || '';
      }
      current = value;
      set(patch);
    });
    errors.number = number.setError;
    fields.push(number.el);
  } else {
    fields.push(h('div', { class: 'field number-field' }, h('span', { class: 'field-label' }, t('documents.editor.number')), numberText));
    errors.number = () => {};
  }

  const issue = dateField({ label: t('documents.editor.issueDate'), value: draft.issueDate || '', required: true, attrs: { id: 'editor-issue-date' } });
  issue.input.addEventListener('change', () => ctx.onIssueDate(issue.value()));
  errors.issueDate = issue.setError;
  fields.push(issue.el);
  if (isTaxDocument(draft.kind)) {
    const tax = dateField({ label: t('documents.editor.taxDate'), value: draft.taxDate || '', hint: t('documents.editor.taxDateHint') });
    tax.input.addEventListener('change', () => set({ taxDate: tax.value() }));
    errors.taxDate = tax.setError;
    fields.push(tax.el);
  }
  if (isPayable(draft.kind)) {
    const due = dateField({ label: t('documents.editor.dueDate'), value: draft.dueDate || '', attrs: { id: 'editor-due-date' } });
    due.input.addEventListener('change', () => set({ dueDate: due.value() }));
    errors.dueDate = due.setError;
    fields.push(due.el);
  }
  if (draft.kind === 'QUOTE') {
    const valid = dateField({ label: t('documents.editor.validUntil'), value: draft.validUntil || '' });
    valid.input.addEventListener('change', () => set({ validUntil: valid.value() }));
    fields.push(valid.el);
  }
  if (draft.kind === 'DELIVERY_NOTE') {
    const delivery = dateField({ label: t('documents.editor.deliveryDate'), value: draft.deliveryDate || '' });
    delivery.input.addEventListener('change', () => set({ deliveryDate: delivery.value() }));
    fields.push(delivery.el);
  }

  const correction = [];
  if (CORRECTION_KINDS.includes(draft.kind)) {
    const link = (draft.links || []).find(l => l.kind === 'CORRECTS');
    const candidates = correctionCandidates(ctx.documents, { contactId: draft.contactId });
    const options = [{ value: '', label: t('documents.editor.correctsNone') }, ...candidates.map(d => ({ value: d.id, label: `${d.number} · ${formatDate(d.issueDate)}` }))];
    if (link && !candidates.some(d => d.id === link.docId)) options.push({ value: link.docId, label: t('documents.editor.correctsOther') });
    const corrects = selectField({
      label: t('documents.editor.corrects'), value: link ? link.docId : '', options, required: true,
      onChange: (id) => set({ links: [...(draft.links || []).filter(l => l.kind !== 'CORRECTS'), ...(id ? [{ kind: 'CORRECTS', docId: id }] : [])] })
    });
    errors.links = corrects.setError;
    const reason = textArea({ label: t('documents.editor.correctionReason'), value: draft.correctionReason || '', rows: 2 });
    reason.input.addEventListener('input', () => set({ correctionReason: reason.value() || null }));
    errors.correctionReason = reason.setError;
    correction.push(corrects.el, reason.el);
  }

  const order = textField({ label: t('documents.editor.orderReference'), value: draft.orderReference || '' });
  order.input.addEventListener('input', () => set({ orderReference: order.value() || null }));
  const contract = textField({ label: t('documents.editor.contractReference'), value: draft.contractReference || '' });
  contract.input.addEventListener('input', () => set({ contractReference: contract.value() || null }));
  fields.push(order.el, contract.el);

  refreshNumber(draft);
  const el = h('section', { class: 'editor-head card', 'aria-labelledby': 'editor-head-title' },
    h('h2', { id: 'editor-head-title' }, t('documents.editor.head')),
    h('div', { class: 'form-grid' }, fields),
    correction.length ? h('div', { class: 'form-grid editor-correction' }, correction) : null);
  return { el, errors, refreshNumber };
}
