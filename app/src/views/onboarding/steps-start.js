// The first wizard steps: language, how to sign in, encryption. Sign-in
// and encryption belong to the sync package: the wizard asks for them
// through events (auth:signIn, encryption:setup) and goes on by itself
// when nobody answers, with a note that the step can be done later.
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { languageOptions } from '../../i18n/languages.js';
import { radioGroup } from '../../components/fields.js';
import { emit } from '../../events.js';

export function languageStep({ draft, update, currentLang, onLanguage }) {
  const group = radioGroup({
    label: t('onboarding.language.title'), name: 'language', value: draft.language || currentLang,
    options: languageOptions().map(o => ({ value: o.value, label: o.label })),
    onChange: (code) => { update({ language: code }); onLanguage(code); }
  });
  return { el: h('div', { class: 'wizard-step' }, h('p', { class: 'muted' }, t('onboarding.language.text')), group.el) };
}

// Options: Google (Drive sync), local only, demo data.
export function signInStep({ draft, update, transport }) {
  const note = h('p', { class: 'wizard-note', hidden: true });
  const group = radioGroup({
    label: t('onboarding.signin.title'), name: 'signin', value: draft.signIn,
    options: [
      { value: 'google', label: t('onboarding.signin.google'), hint: t('onboarding.signin.googleHint') },
      { value: 'local', label: t('onboarding.signin.local'), hint: t('onboarding.signin.localHint') },
      { value: 'demo', label: t('onboarding.signin.demo'), hint: t('onboarding.signin.demoHint') }
    ],
    onChange: (value) => { update({ signIn: value }); note.hidden = true; }
  });
  // Google sign-in is asked for when the user goes on; the result decides
  // the note. The wizard continues either way: a sign-in can be done later.
  const beforeNext = async () => {
    if (draft.signIn !== 'google') return true;
    const request = { handled: false, result: null };
    emit('auth:signIn', request);
    if (request.handled) {
      try { await request.result; return true; } catch (e) { console.error('Sign-in failed', e); note.textContent = t('onboarding.signin.failed'); note.hidden = false; return true; }
    }
    try {
      await transport.auth.signIn();
      return true;
    } catch (e) {
      console.warn('Sign-in not available yet', e);
      note.textContent = t('onboarding.signin.later');
      note.hidden = false;
      update({ signInPending: true });
      return true;
    }
  };
  return { el: h('div', { class: 'wizard-step' }, h('p', { class: 'muted' }, t('onboarding.signin.text')), group.el, note), beforeNext };
}

export function encryptionStep({ draft, update }) {
  const status = h('p', { class: 'wizard-note', id: 'encryption-status' },
    draft.encryption === 'done' ? t('onboarding.encryption.done') : t('onboarding.encryption.pending'));
  const start = h('button', {
    type: 'button', class: 'btn btn-primary', onclick: () => {
      const request = { handled: false, result: null };
      emit('encryption:setup', request);
      if (!request.handled) {
        update({ encryption: 'skipped' });
        status.textContent = t('onboarding.encryption.notReady');
        return;
      }
      Promise.resolve(request.result)
        .then(ok => { update({ encryption: ok === false ? 'skipped' : 'done' }); status.textContent = ok === false ? t('onboarding.encryption.pending') : t('onboarding.encryption.done'); })
        .catch(e => { console.error('Encryption setup failed', e); update({ encryption: 'skipped' }); status.textContent = t('onboarding.encryption.failed'); });
    }
  }, icon('lock'), t('onboarding.encryption.start'));
  return {
    el: h('div', { class: 'wizard-step' },
      h('p', { class: 'muted' }, t('onboarding.encryption.text')),
      h('ul', { class: 'wizard-list' }, h('li', {}, t('onboarding.encryption.point1')), h('li', {}, t('onboarding.encryption.point2')), h('li', {}, t('onboarding.encryption.point3'))),
      start, status),
    beforeNext: () => { if (!draft.encryption) update({ encryption: 'skipped' }); return true; }
  };
}
