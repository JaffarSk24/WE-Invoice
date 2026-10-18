// The last wizard steps: bank account, logo, Peppol now or later, and the
// final screen with "Issue the first invoice".
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { textField, radioGroup } from '../../components/fields.js';
import { checkIban, suggestBic } from './validators.js';
import { normalizeIban } from './state.js';

const LOGO_MAX_BYTES = 500 * 1024;

export function bankStep({ draft, update }) {
  const iban = textField({ label: t('onboarding.bank.iban'), value: draft.iban, hint: t('onboarding.bank.ibanHint'), attrs: { id: 'ob-iban', autocapitalize: 'characters' } });
  const bic = textField({ label: t('onboarding.bank.bic'), value: draft.bic, attrs: { id: 'ob-bic' } });
  const note = h('p', { class: 'wizard-note', role: 'status' });
  iban.input.addEventListener('change', () => {
    const value = normalizeIban(iban.input.value);
    iban.input.value = value;
    if (!value) { iban.setError(null); note.textContent = ''; return; }
    const valid = checkIban(value);
    if (valid === false) { iban.setError(t('onboarding.error.ibanFormat')); return; }
    iban.setError(null);
    note.textContent = valid === null ? t('onboarding.bank.unverified') : '';
    const suggested = suggestBic(value);
    if (suggested && !bic.input.value) bic.input.value = suggested;
  });
  return {
    el: h('div', { class: 'wizard-step' }, h('p', { class: 'muted' }, t('onboarding.bank.text')), h('div', { class: 'form-grid' }, iban.el, bic.el), note),
    beforeNext: () => {
      const value = normalizeIban(iban.value());
      if (value && checkIban(value) === false) { iban.setError(t('onboarding.error.ibanFormat')); return false; }
      update({ iban: value, bic: bic.value().toUpperCase() });
      return true;
    }
  };
}

export function logoStep({ draft, update }) {
  const preview = h('img', { class: 'logo-preview', alt: t('onboarding.logo.preview'), hidden: !draft.logoDataUrl, src: draft.logoDataUrl || null });
  const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml', id: 'ob-logo' });
  const error = h('p', { class: 'field-error', role: 'alert', hidden: true });
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) { error.textContent = t('onboarding.logo.tooBig'); error.hidden = false; return; }
    error.hidden = true;
    const reader = new FileReader();
    reader.onload = () => { update({ logoDataUrl: reader.result }); preview.src = reader.result; preview.hidden = false; };
    reader.onerror = () => { console.error('Logo could not be read', reader.error); error.textContent = t('onboarding.logo.readFailed'); error.hidden = false; };
    reader.readAsDataURL(file);
  });
  const remove = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { update({ logoDataUrl: null }); preview.hidden = true; preview.removeAttribute('src'); input.value = ''; } }, t('onboarding.logo.remove'));
  return {
    el: h('div', { class: 'wizard-step' },
      h('p', { class: 'muted' }, t('onboarding.logo.text')),
      h('div', { class: 'field' }, h('label', { for: 'ob-logo' }, t('onboarding.logo.choose')), input), error, preview, remove)
  };
}

export function peppolStep({ draft, update }) {
  const group = radioGroup({
    label: t('onboarding.peppol.title'), name: 'peppol', value: draft.peppol,
    options: [
      { value: 'now', label: t('onboarding.peppol.now'), hint: t('onboarding.peppol.nowHint') },
      { value: 'later', label: t('onboarding.peppol.later'), hint: t('onboarding.peppol.laterHint') }
    ],
    onChange: (v) => update({ peppol: v })
  });
  const warning = draft.vatMode === 'NONPAYER'
    ? h('div', { class: 'callout callout-warning', role: 'note' }, icon('triangle-alert'), h('span', {}, t('onboarding.peppol.nonPayerWarning')))
    : h('div', { class: 'callout', role: 'note' }, icon('info'), h('span', {}, t('legislation.einvoice.note')));
  const el = h('div', { class: 'wizard-step' }, h('p', { class: 'muted' }, t('onboarding.peppol.text')), warning, group.el);
  refreshIcons(el);
  return { el };
}

export function doneStep({ draft, onFinish }) {
  const demo = draft.signIn === 'demo';
  const el = h('div', { class: 'wizard-step wizard-done' },
    icon('party-popper', 'wizard-done-icon'),
    h('h2', {}, demo ? t('onboarding.done.demoTitle') : t('onboarding.done.title')),
    h('p', { class: 'muted' }, demo ? t('onboarding.done.demoText') : t('onboarding.done.text')),
    h('div', { class: 'wizard-done-actions' },
      h('button', { type: 'button', class: 'btn btn-brand', id: 'ob-first-invoice', onclick: () => onFinish('invoice') }, icon('file-plus-2'), t('onboarding.done.firstInvoice')),
      h('button', { type: 'button', class: 'btn', id: 'ob-go-dashboard', onclick: () => onFinish('dashboard') }, t('onboarding.done.dashboard')),
      !demo && draft.peppol === 'now'
        ? h('button', { type: 'button', class: 'btn', onclick: () => onFinish('peppol') }, icon('send'), t('onboarding.done.peppol'))
        : null));
  refreshIcons(el);
  return { el, final: true };
}
