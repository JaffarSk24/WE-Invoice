// The form of the review: every field of a received document with a mark
// where recognition was unsure ("Skontrolujte") and a "Vybrať" button that
// lets the user take the value from the preview instead of typing it.
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { textField, dateField, selectField, textArea } from '../../components/fields.js';
import { amountText } from './amount-text.js';
import { EXPENSE_CATEGORIES, schema } from '@we-invoice/core';
import { valuesOf, AMOUNT_FIELDS } from './review-values.js';

const LOW = 0.7;
const KINDS = ['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT'];
const PICKABLE = new Set(['supplierName', 'ico', 'dic', 'icDph', 'number', 'vs', 'ks', 'ss', 'issueDate', 'taxDate', 'dueDate', 'net', 'vat', 'total', 'iban']);

// Sections of the form and their fields, in order.
export const SECTIONS = Object.freeze([
  { id: 'supplier', fields: ['supplierName', 'ico', 'dic', 'icDph', 'iban'] },
  { id: 'document', fields: ['kind', 'number', 'vs', 'ks', 'ss', 'issueDate', 'taxDate', 'dueDate', 'receivedDate'] },
  { id: 'amounts', fields: ['currency', 'net', 'vat', 'total'] },
  { id: 'booking', fields: ['category', 'paymentMethod', 'vatDeductionPeriod', 'note'] }
]);

function control(name, value) {
  const label = t(`purchase.field.${name}`);
  if (name === 'kind') return selectField({ label, value, options: KINDS.map(k => ({ value: k, label: t(`document.kind.${k}`) })) });
  if (name === 'category') {
    return selectField({ label, value, options: [{ value: '', label: t('purchase.category.none') }, ...EXPENSE_CATEGORIES.map(c => ({ value: c.id, label: t(`purchase.category.${c.id}`) }))] });
  }
  if (name === 'paymentMethod') {
    return selectField({ label, value, options: [{ value: '', label: t('purchase.paymentMethod.none') }, ...schema.PAYMENT_METHODS.map(m => ({ value: m, label: t(`purchase.paymentMethod.${m}`) }))] });
  }
  if (name.endsWith('Date')) return dateField({ label, value });
  if (name === 'note') return textArea({ label, value, rows: 2 });
  if (AMOUNT_FIELDS.includes(name)) return textField({ label, value: value ? amountText(value) : '', attrs: { inputmode: 'decimal', class: 'num' } });
  const hint = name === 'vatDeductionPeriod' ? t('purchase.field.vatDeductionPeriod.hint') : null;
  return textField({ label, value, hint, attrs: name === 'currency' ? { maxlength: '3', class: 'input-currency' } : {} });
}

/**
 * @param {object} doc
 * @param {{onPick?: (field: string) => void, pickEnabled?: boolean, vatPayer?: boolean}} options
 */
export function createReviewForm(doc, { onPick = null, pickEnabled = false, vatPayer = true } = {}) {
  const initial = valuesOf(doc);
  const conf = (doc.inbox && doc.inbox.fieldConfidence) || {};
  const sources = (doc.inbox && doc.inbox.sources) || {};
  const fields = {};
  const el = h('form', { class: 'review-form', novalidate: true, onsubmit: (e) => e.preventDefault() });

  for (const section of SECTIONS) {
    const box = h('fieldset', { class: 'review-section', dataset: { section: section.id } }, h('legend', {}, t(`purchase.section.${section.id}`)));
    for (const name of section.fields) {
      if (name === 'vatDeductionPeriod' && !vatPayer) continue;
      const field = control(name, initial[name]);
      field.input.dataset.field = name;
      field.el.dataset.field = name;
      // The kind is a guess from keywords; marking it would mostly be noise.
      const low = name !== 'kind' && conf[name] !== undefined && conf[name] < LOW && sources[name] !== 'user';
      if (low) {
        field.el.classList.add('field-low');
        field.el.append(h('div', { class: 'field-check' }, icon('triangle-alert'), t('purchase.review.check')));
      }
      if (name !== 'kind' && sources[name] && initial[name]) field.el.append(h('div', { class: 'field-source muted' }, t(`purchase.source.${sources[name]}`)));
      if (pickEnabled && onPick && PICKABLE.has(name)) {
        const pick = h('button', {
          type: 'button', class: 'btn btn-ghost btn-icon btn-sm field-pick', dataset: { pick: name },
          'aria-label': t('purchase.review.pickField', { field: t(`purchase.field.${name}`) }), title: t('purchase.review.pick'),
          onclick: () => onPick(name)
        }, icon('crosshair'));
        field.input.after(pick);
      }
      fields[name] = field;
      box.append(field.el);
    }
    el.append(box);
  }

  return {
    el,
    fields,
    values() {
      const out = { ...initial };
      Object.entries(fields).forEach(([name, f]) => {
        const v = f.input.value;
        out[name] = name === 'currency' ? String(v || '').trim().toUpperCase() : String(v ?? '').trim();
      });
      return out;
    },
    setValue(name, value) {
      const f = fields[name];
      if (!f) return;
      f.input.value = AMOUNT_FIELDS.includes(name) ? amountText(value) : value;
      f.el.classList.remove('field-low');
      f.el.querySelector('.field-check')?.remove();
      f.el.classList.add('field-picked');
      f.input.dispatchEvent(new Event('change', { bubbles: true }));
    },
    showErrors(errors) {
      Object.entries(fields).forEach(([name, f]) => f.setError(errors[name] ? t(errors[name]) : ''));
      const first = Object.keys(fields).find(n => errors[n]);
      if (first) fields[first].input.focus();
      return Boolean(first);
    }
  };
}
