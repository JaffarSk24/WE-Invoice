// A new password: only the header is rewrapped (account.js).
import { h } from '../../ui/dom.js';
import { openModal } from '../../ui/modal.js';
import { t } from '../../i18n/index.js';
import { passwordField, strengthHint, errorLine, paragraph } from './fields.js';
import { changePassword } from '../account.js';
import { MIN_PASSWORD } from '../crypto.js';

export function openChangePasswordModal({ engine, showToast }) {
  const old = passwordField('sync.change.old', { autofocus: true });
  const next = passwordField('sync.change.new', { autocomplete: 'new-password' });
  const again = passwordField('sync.change.confirm', { autocomplete: 'new-password' });
  const error = errorLine();
  const busy = { on: false };
  return openModal({
    title: t('sync.change.title'),
    body: h('div', {}, paragraph('sync.change.text'), old.wrap, next.wrap, strengthHint(next.input), again.wrap, error.el),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('sync.change.button'), kind: 'primary',
        onClick: async (m) => {
          if (busy.on) return;
          error.clear();
          if (next.input.value.length < MIN_PASSWORD) { error.showKey('errors.WEAK_PASSWORD'); return; }
          if (next.input.value !== again.input.value) { error.showKey('sync.password.mismatch'); return; }
          busy.on = true;
          try {
            await changePassword(engine, old.input.value, next.input.value);
            m.close();
            showToast(t('sync.change.done'), { type: 'success' });
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
