// Payment and print settings of a document in the editor: the payment
// method, the company bank account, the symbols (VS, KS, ŠS), currency
// with the ECB rate, the print language and second language, the PDF
// template, the texts before and after the lines and the internal note.
import { schema } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { selectField, textField, textArea } from '../../components/fields.js';
import { parseDecimal, toInputText } from '../../components/decimal.js';
import { showError } from '../../ui/toast.js';
import { printLanguageOptions } from '../settings/documents-section.js';
import { PDF_TEMPLATES } from '../../pdf/index.js';
import { CURRENCIES, fetchEcbRate } from './fx.js';

const SYMBOL = { vs: /^\d{0,10}$/, ks: /^\d{0,4}$/, ss: /^\d{0,10}$/ };

function symbolField(key, draft, set, errors) {
  const field = textField({ label: t(`documents.editor.${key}`), value: draft[key] || '', attrs: { inputmode: 'numeric', maxlength: key === 'ks' ? '4' : '10', id: `editor-${key}` } });
  field.input.addEventListener('input', () => {
    const value = field.value();
    if (!SYMBOL[key].test(value)) { field.setError(t(`documents.editor.errors.${key}`)); return; }
    field.setError(null);
    set({ [key]: value || null });
  });
  errors[key] = field.setError;
  return field.el;
}

function currencyFields(draft, ctx, set, errors) {
  const options = [...new Set([...CURRENCIES, draft.currency || 'EUR'])].map(c => ({ value: c, label: c }));
  const currency = selectField({ label: t('documents.editor.currency'), value: draft.currency || 'EUR', options, onChange: (value) => ctx.onDraft({ currency: value, fxRate: value === 'EUR' ? null : draft.fxRate }, { redraw: 'all' }) });
  if ((draft.currency || 'EUR') === 'EUR') return [currency.el];
  const rate = textField({ label: t('documents.editor.fxRate'), value: toInputText(draft.fxRate), hint: t('documents.editor.fxRateHint', { currency: draft.currency }), attrs: { inputmode: 'decimal', class: 'num', id: 'editor-fx-rate' } });
  rate.input.addEventListener('change', () => {
    const parsed = parseDecimal(rate.value());
    if (rate.value() && parsed === null) { rate.setError(t('documents.editor.invalidNumber')); return; }
    rate.setError(null);
    set({ fxRate: parsed, fxSource: parsed ? 'MANUAL' : null, fxRateDate: parsed ? (draft.taxDate || draft.issueDate) : null });
  });
  errors.fxRate = rate.setError;
  const ecb = h('button', {
    type: 'button', class: 'btn btn-ghost btn-sm', onclick: async () => {
      const date = draft.taxDate || draft.issueDate;
      try {
        const found = await fetchEcbRate(ctx.transport, draft.currency, date);
        rate.input.value = toInputText(found.rate);
        rate.setError(null);
        set({ fxRate: found.rate, fxSource: 'ECB', fxRateDate: found.date });
      } catch (e) {
        showError(e);
      }
    }
  }, icon('refresh-cw'), t('documents.editor.fxEcb'));
  rate.el.append(ecb);
  return [currency.el, rate.el];
}

/**
 * @param {{draft: object, company: object, transport: object, onDraft: Function}} ctx
 * @returns {{el: HTMLElement, errors: Object<string, Function>}}
 */
export function paymentForm(ctx) {
  const { draft, company } = ctx;
  const errors = {};
  const set = (patch) => ctx.onDraft(patch, { redraw: false });
  const method = selectField({
    label: t('documents.editor.paymentMethod'), value: draft.paymentMethod || 'TRANSFER',
    options: schema.PAYMENT_METHODS.map(m => ({ value: m, label: t(`documents.payment.method.${m}`) })),
    onChange: (value) => ctx.onDraft({ paymentMethod: value }, { redraw: 'all' })
  });
  const fields = [method.el];
  const accounts = (company && company.bankAccounts) || [];
  if (accounts.length && ['TRANSFER', 'QR_ON_SITE', 'ONLINE'].includes(draft.paymentMethod || 'TRANSFER')) {
    const account = selectField({
      label: t('documents.editor.bankAccount'), value: draft.bankAccountId || '',
      options: accounts.map(a => ({ value: a.id, label: [a.name, a.iban, a.currency].filter(Boolean).join(' · ') })),
      onChange: (value) => set({ bankAccountId: value })
    });
    fields.push(account.el);
  }
  fields.push(symbolField('vs', draft, set, errors), symbolField('ks', draft, set, errors), symbolField('ss', draft, set, errors));
  fields.push(...currencyFields(draft, ctx, set, errors));

  const languages = printLanguageOptions();
  const language = selectField({ label: t('documents.editor.language'), value: draft.language || 'sk', options: languages, onChange: (value) => ctx.onLanguage(value), attrs: { id: 'editor-language' } });
  const second = selectField({
    label: t('documents.editor.secondLanguage'), value: draft.secondLanguage || '',
    options: [{ value: '', label: t('pdf.settings.secondLanguageNone') }, ...languages.filter(o => o.value !== draft.language)],
    onChange: (value) => set({ secondLanguage: value || null })
  });
  const template = selectField({
    label: t('pdf.settings.template'), value: draft.template || 'CLASSIC',
    options: PDF_TEMPLATES.map(id => ({ value: id, label: t(`pdf.template.${id}`) })), onChange: (value) => set({ template: value })
  });

  const intro = textArea({ label: t('documents.editor.textIntro'), value: draft.textIntro || '', rows: 2, hint: t('documents.editor.textHint') });
  intro.input.addEventListener('input', () => set({ textIntro: intro.value() || null }));
  const outro = textArea({ label: t('documents.editor.textOutro'), value: draft.textOutro || '', rows: 2 });
  outro.input.addEventListener('input', () => set({ textOutro: outro.value() || null }));
  const note = textArea({ label: t('documents.editor.noteInternal'), value: draft.noteInternal || '', rows: 2, hint: t('documents.editor.noteInternalHint') });
  note.input.addEventListener('input', () => set({ noteInternal: note.value() || null }));

  const el = h('div', { class: 'editor-extra' },
    h('section', { class: 'editor-payment card', 'aria-labelledby': 'editor-payment-title' },
      h('h2', { id: 'editor-payment-title' }, t('documents.editor.payment')), h('div', { class: 'form-grid' }, fields)),
    h('section', { class: 'editor-print card', 'aria-labelledby': 'editor-print-title' },
      h('h2', { id: 'editor-print-title' }, t('documents.editor.print')),
      h('div', { class: 'form-grid' }, language.el, second.el, template.el),
      intro.el, outro.el, note.el));
  return { el, errors };
}
