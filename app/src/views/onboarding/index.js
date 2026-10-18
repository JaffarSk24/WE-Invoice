// The "My company" wizard screen (03-features.md § 3.1): one step at a
// time, progress on top, Back and Continue below, the draft saved after
// every step so the wizard can be left and resumed. At the end the company
// is handed to the sync package (onboarding:complete) and shown in the
// shell (company:switched).
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t, currentLang, setLanguage } from '../../i18n/index.js';
import { getPrefs, setPref } from '../../prefs.js';
import { emit } from '../../events.js';
import { navigate } from '../../router.js';
import { showToast } from '../../ui/toast.js';
import { confirmDialog } from '../../ui/modal.js';
import { getTransport } from '../../transport/index.js';
import { uuidv7 } from '@we-invoice/core';
import { STEPS, EMPTY_DRAFT, nextStep, prevStep, stepErrors, progress, draftToCompany, loadDraft, saveDraft, clearDraft, loadLocalCompany, saveLocalCompany } from './state.js';
import { languageStep, signInStep, encryptionStep } from './steps-start.js';
import { companyStep, vatStep, accountingStep } from './steps-company.js';
import { bankStep, logoStep, peppolStep, doneStep } from './steps-finish.js';
import { enableDemo, isDemo } from '../shell/demo-mode.js';

const RENDERERS = { language: languageStep, signin: signInStep, encryption: encryptionStep, company: companyStep, vat: vatStep, accounting: accountingStep, bank: bankStep, logo: logoStep, peppol: peppolStep, done: doneStep };

export function needsOnboarding() {
  const prefs = getPrefs();
  return !prefs.onboardingDone && !isDemo() && !loadLocalCompany();
}

// The company the device remembers from a finished wizard, for the shell
// until the store takes over.
export function rememberedCompany() {
  if (isDemo()) return null;
  return loadLocalCompany();
}

function finish(draft, target) {
  if (draft.signIn === 'demo') {
    enableDemo();
  } else {
    const now = new Date().toISOString();
    const company = draftToCompany(draft, { id: uuidv7(), now });
    saveLocalCompany(company);
    emit('onboarding:complete', { company, signIn: draft.signIn, signInPending: Boolean(draft.signInPending), encryption: draft.encryption });
    emit('company:switched', { company, companies: [company] });
  }
  setPref('onboardingDone', true);
  clearDraft();
  showToast(t('onboarding.finished'), { type: 'success' });
  if (target === 'invoice') { navigate('invoices'); emit('document:new', { kind: 'INVOICE' }); }
  else if (target === 'peppol') navigate('settings/peppol');
  else navigate('dashboard');
}

export function renderOnboarding(root) {
  const draft = loadDraft() || { ...EMPTY_DRAFT, address: { ...EMPTY_DRAFT.address } };
  if (!STEPS.includes(draft.step)) draft.step = 'language';
  const transport = getTransport();
  const errorBox = h('div', { class: 'wizard-errors', role: 'alert', hidden: true });

  const update = (patch) => {
    Object.assign(draft, patch);
    if (patch.address) draft.address = { ...draft.address, ...patch.address };
    saveDraft(draft);
  };

  let step = null;
  const body = h('div', { class: 'wizard-body' });
  const footer = h('div', { class: 'wizard-footer' });
  const head = h('div', { class: 'wizard-head' });

  function showErrors(keys) {
    errorBox.hidden = !keys.length;
    while (errorBox.firstChild) errorBox.removeChild(errorBox.firstChild);
    keys.forEach(k => errorBox.append(h('p', {}, t(k))));
  }

  async function goNext() {
    if (step.beforeNext && (await step.beforeNext()) === false) return;
    const errors = stepErrors(draft.step, draft);
    showErrors(errors);
    if (errors.length) return;
    const next = nextStep(draft.step, draft);
    if (!next) return;
    update({ step: next });
    draw();
  }

  function goBack() {
    const prev = prevStep(draft.step, draft);
    if (!prev) return;
    update({ step: prev });
    draw();
  }

  function draw() {
    showErrors([]);
    const name = draft.step;
    const { index, total } = progress(name, draft);
    while (head.firstChild) head.removeChild(head.firstChild);
    head.append(
      h('div', { class: 'wizard-progress', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': String(total), 'aria-valuenow': String(index), 'aria-label': t('onboarding.progress', { step: index, total }) },
        h('div', { class: 'wizard-progress-bar', style: { width: `${Math.round((index / total) * 100)}%` } })),
      h('p', { class: 'muted wizard-counter' }, t('onboarding.progress', { step: index, total })),
      h('h1', { id: 'wizard-title', tabindex: '-1' }, t(`onboarding.step.${name}`)));
    step = RENDERERS[name]({
      draft, update, transport, currentLang: currentLang(),
      onLanguage: async (code) => { setPref('language', code); await setLanguage(code); emit('language:changed', code); draw(); },
      onFinish: (target) => finish(draft, target)
    });
    while (body.firstChild) body.removeChild(body.firstChild);
    body.append(step.el);
    while (footer.firstChild) footer.removeChild(footer.firstChild);
    if (!step.final) {
      footer.append(
        h('button', { type: 'button', class: 'btn btn-ghost', disabled: !prevStep(name, draft), onclick: goBack }, icon('arrow-left'), t('onboarding.back')),
        h('span', { class: 'wizard-spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { saveDraft(draft); showToast(t('onboarding.savedForLater'), { type: 'info' }); navigate('dashboard'); } }, t('onboarding.later')),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'ob-next', onclick: goNext }, t('onboarding.next'), icon('arrow-right')));
    }
    refreshIcons(root);
    const title = head.querySelector('h1');
    if (title) title.focus();
  }

  root.append(h('div', { class: 'wizard card' }, head, errorBox, body, footer,
    h('div', { class: 'wizard-restart' }, h('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', onclick: async () => {
        if (!(await confirmDialog(t('onboarding.restartConfirm')))) return;
        clearDraft();
        Object.assign(draft, EMPTY_DRAFT, { address: { ...EMPTY_DRAFT.address } });
        draw();
      }
    }, t('onboarding.restart')))));
  draw();
}
