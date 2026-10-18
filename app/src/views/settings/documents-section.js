// The Documents section of Settings until the sales package brings its full
// form (series, due days, texts, templates): the print language of the open
// company's documents and an optional second language for bilingual ones.
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
