// The Documents section of Settings (03-features.md § 3.17): the print
// language of the open company's documents and an optional second language
// for bilingual ones, the document defaults (due days, payment method,
// template, colour, texts, PDF file name, cash rounding, the "Vystavené vo
// WE Invoice" line) and the numbering series (numbering-section.js).
// Slovak is the default. A client whose card has a language of their own
// gets documents in it (packages/core issueDocument), so this is only the
// fallback. Interface language and print language are separate on purpose:
// the app can speak Russian while the invoices go out in Slovak.
import { h, selectEl } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { languageInfo } from '../../i18n/languages.js';
import { schema } from '@we-invoice/core';
import { hasStore, getStore } from '../../store/index.js';
import { saveLocalCompany } from '../onboarding/state.js';
import { currentCompany, companyList } from '../shell/company-state.js';
import { isDemo } from '../shell/demo-mode.js';
import { emit } from '../../events.js';
import { showToast, showError } from '../../ui/toast.js';
import { selectField, textArea, textField, checkboxField } from '../../components/fields.js';
import { PDF_TEMPLATES } from '../../pdf/index.js';
import { numberingSection } from './numbering-section.js';

export const DEFAULT_PRINT_LANGUAGE = 'sk';

export function printLanguageOptions() {
  return schema.PRINT_LANGUAGES.map(code => ({ value: code, label: languageInfo(code).name }));
}

// The language pair the selects show for a company record.
export function printDefaults(company) {
  const d = (company && company.defaults) || {};
  const language = schema.PRINT_LANGUAGES.includes(d.language) ? d.language : DEFAULT_PRINT_LANGUAGE;
  const second = schema.PRINT_LANGUAGES.includes(d.secondLanguage) && d.secondLanguage !== language ? d.secondLanguage : null;
  return { language, secondLanguage: second };
}

// Saves the defaults of the open company: through the store when it holds
// that company, otherwise in the copy the device keeps after the wizard.
export async function saveCompanyDefaults(patch, { store = hasStore() ? getStore() : null } = {}) {
  const company = currentCompany();
  if (!company) return null;
  const defaults = { ...(company.defaults || {}), ...patch };
  let next;
  if (store && store.company() && store.company().id === company.id) {
    next = await store.updateCompany({ defaults });
  } else {
    next = { ...company, defaults, updatedAt: new Date().toISOString() };
    saveLocalCompany(next);
  }
  emit('company:switched', { company: next, companies: companyList().map(c => (c.id === next.id ? next : c)) });
  return next;
}

function row(label, control, hint) {
  return h('div', { class: 'setting-row' },
    h('div', { class: 'setting-text' }, h('span', { class: 'setting-label' }, label), h('span', { class: 'setting-hint' }, hint)),
    h('div', { class: 'setting-control' }, control));
}

export function documentsSection(root, { redraw }) {
  const company = currentCompany();
  root.append(h('p', { class: 'muted' }, t('settings.section.documents.text')));
  if (!company) {
    root.append(h('p', { class: 'muted small' }, t('placeholder.text')));
    return;
  }
  const demo = isDemo();
  const current = printDefaults(company);
  const language = selectEl(printLanguageOptions(), current.language, { id: 'settings-print-language', 'aria-label': t('pdf.settings.language'), disabled: demo });
  const secondOptions = [{ value: '', label: t('pdf.settings.secondLanguageNone') }, ...printLanguageOptions().filter(o => o.value !== current.language)];
  const second = selectEl(secondOptions, current.secondLanguage || '', { id: 'settings-print-second', 'aria-label': t('pdf.settings.secondLanguage'), disabled: demo });

  const save = async () => {
    const lang = language.value;
    const patch = { language: lang, secondLanguage: second.value && second.value !== lang ? second.value : null };
    try {
      await saveCompanyDefaults(patch);
      showToast(t('pdf.settings.saved'), { type: 'success' });
      redraw();
    } catch (e) {
      console.error('Document settings could not be saved', e);
      showError(e);
    }
  };
  language.addEventListener('change', save);
  second.addEventListener('change', save);

  root.append(
    row(t('pdf.settings.language'), language, t('pdf.settings.languageHint')),
    row(t('pdf.settings.secondLanguage'), second, t('pdf.settings.secondLanguageHint')));
  if (demo) root.append(h('p', { class: 'muted small' }, t('pdf.settings.demoHint')));
}

// Checks of the defaults form; each returns an i18n key or null.
export function dueDaysError(text) {
  return /^\d{1,4}$/.test(String(text).trim()) && Number(text) <= 3650 ? null : 'documents.settings.errors.dueDays';
}

export function fileMaskError(text) {
  const mask = String(text || '').trim();
  if (!mask) return 'documents.settings.errors.fileMask';
  const unknown = (mask.match(/\{(\w+)\}/g) || []).filter(m => !['{kind}', '{number}', '{buyer}', '{seller}', '{date}', '{vs}'].includes(m));
  return unknown.length ? 'documents.settings.errors.fileMask' : null;
}

function defaultsForm(root, company, demo) {
  const d = company.defaults || {};
  const texts = d.texts || {};
  const save = async (patch, message = 'pdf.settings.saved') => {
    try {
      await saveCompanyDefaults(patch);
      showToast(t(message), { type: 'success' });
    } catch (e) {
      console.error('Document defaults could not be saved', e);
      showError(e);
    }
  };
  const due = textField({ label: t('documents.settings.dueDays'), value: String(d.dueDays ?? 14), attrs: { inputmode: 'numeric', id: 'settings-due-days', disabled: demo } });
  due.input.addEventListener('change', () => {
    const error = dueDaysError(due.value());
    due.setError(error ? t(error) : null);
    if (!error) save({ dueDays: Number(due.value()) });
  });
  const method = selectField({
    label: t('documents.settings.paymentMethod'), value: d.paymentMethod || 'TRANSFER', attrs: { disabled: demo },
    options: schema.PAYMENT_METHODS.map(m => ({ value: m, label: t(`documents.payment.method.${m}`) })), onChange: (value) => save({ paymentMethod: value })
  });
  const template = selectField({
    label: t('pdf.settings.template'), value: d.template || 'CLASSIC', attrs: { disabled: demo, id: 'settings-template' },
    options: PDF_TEMPLATES.map(id => ({ value: id, label: t(`pdf.template.${id}`) })), onChange: (value) => save({ template: value })
  });
  const color = textField({ label: t('pdf.settings.brandColor'), type: 'color', value: d.brandColor || '#4facfe', attrs: { disabled: demo } });
  color.input.addEventListener('change', () => save({ brandColor: color.input.value }));
  const intro = textArea({ label: t('documents.settings.textIntro'), value: texts.intro || '', rows: 2, hint: t('documents.editor.textHint'), attrs: { disabled: demo } });
  const outro = textArea({ label: t('documents.settings.textOutro'), value: texts.outro || '', rows: 2, attrs: { disabled: demo } });
  [intro, outro].forEach(f => f.input.addEventListener('change', () => save({ texts: { ...texts, intro: intro.value() || null, outro: outro.value() || null } })));
  const mask = textField({ label: t('pdf.settings.fileMask'), value: d.pdfFileMask || '{kind}_{number}_{buyer}', hint: t('pdf.settings.fileMaskHint'), attrs: { disabled: demo, id: 'settings-file-mask' } });
  mask.input.addEventListener('change', () => {
    const error = fileMaskError(mask.value());
    mask.setError(error ? t(error) : null);
    if (!error) save({ pdfFileMask: mask.value() });
  });
  const rounding = checkboxField({ label: t('documents.settings.roundingCash'), checked: Boolean(d.roundingCash), hint: t('documents.settings.roundingCashHint'), onChange: (on) => save({ roundingCash: on }) });
  const madeWith = checkboxField({ label: t('pdf.settings.showMadeWith'), checked: d.showMadeWith !== false, onChange: (on) => save({ showMadeWith: on }) });
  [rounding, madeWith].forEach(f => { f.input.disabled = demo; });
  root.append(
    h('h3', { class: 'settings-subtitle' }, t('documents.settings.defaults')),
    h('div', { class: 'form-grid' }, due.el, method.el, template.el, color.el, mask.el),
    intro.el, outro.el, rounding.el, madeWith.el);
}

// The whole section as Settings registers it (boot/sales-documents.js).
export function documentsSettings(root, { redraw }) {
  documentsSection(root, { redraw });
  const company = currentCompany();
  if (!company) return;
  const demo = isDemo();
  defaultsForm(root, company, demo);
  numberingSection(root, { redraw, company, demo });
}
