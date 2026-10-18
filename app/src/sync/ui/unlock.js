// The password on a device without the key, and recovery with the 24
// words when the password is lost.
import { h } from '../../ui/dom.js';
import { openModal } from '../../ui/modal.js';
import { t } from '../../i18n/index.js';
import { passwordField, textArea, strengthHint, errorLine, paragraph } from './fields.js';
import { unlock, recover } from '../account.js';
import { MIN_PASSWORD } from '../crypto.js';

export function openUnlockModal({ engine, showToast }) {
  const pass = passwordField('sync.unlock.text', { autofocus: true });
  pass.wrap.querySelector('label').textContent = t('sync.password.label');
  const error = errorLine();
  const busy = { on: false };
  const forgot = h('button', { type: 'button', class: 'btn btn-ghost sync-link', onclick: () => { modal.close(); openRecoverModal({ engine, showToast }); } }, t('sync.unlock.forgot'));
  const modal = openModal({
    title: t('sync.unlock.title'),
    body: h('div', {}, paragraph('sync.unlock.text'), pass.wrap, error.el, forgot),
    actions: [
      { label: t('sync.signIn.later'), onClick: (m) => m.close() },
      {
        label: t('sync.unlock.button'), kind: 'primary',
        onClick: async (m) => {
          if (busy.on) return;
          busy.on = true;
          error.clear();
          try {
            await unlock(engine, pass.input.value);
            m.close();
            if (!engine.vault.keyStored) showToast(t('sync.keyNotStored'), { type: 'info', duration: 10000 });
          } catch (e) {
            error.show(e);
          } finally {
            busy.on = false;
          }
        }
      }
    ]
  });
  return modal;
}

export function openRecoverModal({ engine, showToast }) {
  const words = textArea('sync.recover.wordsLabel', { rows: 4 });
  const pass = passwordField('sync.recover.newPassword', { autocomplete: 'new-password' });
  const again = passwordField('sync.password.confirmLabel', { autocomplete: 'new-password' });
  const error = errorLine();
  const busy = { on: false };
  return openModal({
    title: t('sync.recover.title'),
    body: h('div', {}, paragraph('sync.recover.text'), words.wrap, pass.wrap, strengthHint(pass.input), again.wrap, error.el),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('sync.recover.button'), kind: 'primary',
        onClick: async (m) => {
          if (busy.on) return;
          error.clear();
          if (pass.input.value.length < MIN_PASSWORD) { error.showKey('errors.WEAK_PASSWORD'); return; }
          if (pass.input.value !== again.input.value) { error.showKey('sync.password.mismatch'); return; }
          busy.on = true;
          try {
            await recover(engine, words.input.value, pass.input.value);
            m.close();
            showToast(t('sync.recover.done'), { type: 'success' });
          } catch (e) {
            error.show(e);
          } finally {
            busy.on = false;
          }
        }
      }
    ]
  });
}
