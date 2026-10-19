// The Company section of Settings (03-features.md § 3.17): the details
// printed on every document (name, IČO, DIČ, IČ DPH, the register entry,
// address, contacts), the VAT mode, eKasa use, the bank accounts and the
// images. Saved with one button after the identifiers pass their checks;
// issued documents keep their own snapshot, so nothing issued changes.
import { schema } from '@we-invoice/core';
import { h, icon, append } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { showToast, showError } from '../../ui/toast.js';
import { textField, selectField, checkboxField } from '../../components/fields.js';
import { isDemo } from '../shell/demo-mode.js';
import { companyErrors, normalizeCompany } from './company-section-rules.js';
import { companyForForms, saveCompanyPatch } from './company-section-store.js';
import { accountsBlock, imagesBlock } from './company-section-assets.js';

const TEXT_FIELDS = ['name', 'ico', 'dic', 'icDph', 'registerEntry', 'street', 'city', 'zip', 'country', 'email', 'phone', 'web'];

function valuesOf(company) {
  const a = company.address || {};
  return {
    name: company.name || '', ico: company.ico || '', dic: company.dic || '', icDph: company.icDph || '', registerEntry: company.registerEntry || '',
    street: a.street || '', city: a.city || '', zip: a.zip || '', country: a.country || 'SK', email: company.email || '', phone: company.phone || '', web: company.web || ''
  };
}

export function companySection(root, { redraw }) {
  const company = companyForForms();
  if (!company) {
    root.append(h('p', { class: 'muted' }, t('settings.section.company.text')), h('p', { class: 'muted small' }, t('errors.NO_COMPANY')));
    return;
  }
  const demo = isDemo();
  const values = valuesOf(company);
  const fields = Object.fromEntries(TEXT_FIELDS.map(key => [key, textField({
    label: t(`documents.company.${key}`), value: values[key], required: key === 'name',
    hint: key === 'registerEntry' ? t('documents.company.registerEntryHint') : null,
    attrs: { id: `company-${key}`, disabled: demo, ...(key === 'country' ? { maxlength: '2' } : {}) }
  })]));
  const vatMode = selectField({ label: t('documents.company.vatMode'), value: company.vatMode || 'NONPAYER', attrs: { id: 'company-vatMode', disabled: demo }, options: schema.VAT_MODES.map(m => ({ value: m, label: t(`vatMode.${m}`) })) });
  const ekasaExempt = checkboxField({ label: t('documents.company.ekasaExempt'), checked: company.ekasaExempt === true, hint: t('documents.company.ekasaExemptHint') });
  ekasaExempt.input.disabled = demo;

  const save = async () => {
    const raw = { ...Object.fromEntries(TEXT_FIELDS.map(k => [k, fields[k].value()])), vatMode: vatMode.value() };
    const errors = companyErrors(raw);
    TEXT_FIELDS.forEach(k => fields[k].setError(errors[k] ? t(errors[k]) : null));
    if (Object.keys(errors).length) {
      showToast(t('documents.company.errors.form'), { type: 'error' });
      const first = TEXT_FIELDS.find(k => errors[k]);
      if (first) fields[first].input.focus();
      return;
    }
    const v = normalizeCompany(raw);
    try {
      const saved = await saveCompanyPatch({
        name: v.name, ico: v.ico, dic: v.dic, icDph: v.icDph, registerEntry: v.registerEntry, address: { ...(company.address || {}), ...v.address },
        email: v.email, phone: v.phone, web: v.web, vatMode: v.vatMode, ekasaExempt: ekasaExempt.value()
      });
      if (saved) { showToast(t('documents.company.saved'), { type: 'success' }); redraw(); }
    } catch (e) {
      showError(e);
    }
  };

  append(root, [
    h('p', { class: 'muted' }, t('settings.section.company.text')),
    h('div', { class: 'form-grid company-form' }, TEXT_FIELDS.map(k => fields[k].el), vatMode.el),
    ekasaExempt.el,
    h('p', { class: 'muted small' }, t('documents.company.snapshotHint')),
    h('div', { class: 'form-actions' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'company-save', disabled: demo, onclick: save }, icon('check'), t('common.save'))),
    accountsBlock(company, { demo, redraw }),
    imagesBlock(company, { demo, redraw }),
    demo ? h('p', { class: 'muted small' }, t('pdf.settings.demoHint')) : null]);
}
