// Turning encryption on (first start): a password, then the recovery key
// shown once and confirmed, then the first upload.
import { h } from '../../ui/dom.js';
import { openModal } from '../../ui/modal.js';
import { t } from '../../i18n/index.js';
import { passwordField, strengthHint, errorLine, paragraph } from './fields.js';
import { showRecoveryWords } from './recovery-view.js';
import { setupEncryption, confirmSetup } from '../account.js';
import { MIN_PASSWORD } from '../crypto.js';

export function openSetupModal({ engine, transport, showToast, showError }) {
  const pass = passwordField('sync.password.label', { autocomplete: 'new-password', autofocus: true });
  const again = passwordField('sync.password.confirmLabel', { autocomplete: 'new-password' });
  const error = errorLine();
  const busy = { on: false };
  return openModal({
    title: t('sync.password.title'),
    body: h('div', {}, paragraph('sync.password.text'), pass.wrap, strengthHint(pass.input), again.wrap, error.el),
    actions: [
      { label: t('sync.signIn.later'), onClick: (m) => m.close() },
      {
        label: t('sync.password.create'), kind: 'primary',
        onClick: async (m) => {
          if (busy.on) return;
          error.clear();
          if (pass.input.value.length < MIN_PASSWORD) { error.showKey('errors.WEAK_PASSWORD'); return; }
          if (pass.input.value !== again.input.value) { error.showKey('sync.password.mismatch'); return; }
          busy.on = true;
          try {
            const { words, confirm } = await setupEncryption(engine, pass.input.value);
            m.close();
            if (!engine.vault.keyStored) showToast(t('sync.keyNotStored'), { type: 'info', duration: 10000 });
            const confirmed = await showRecoveryWords({ words, positions: confirm, transport, showToast });
            if (!confirmed) return;
            const result = await confirmSetup(engine);
            if (result.ok || result.outcome === 'off') showToast(t('sync.recovery.done'), { type: 'success' });
          } catch (e) {
            error.show(e);
            showError(e);
          } finally {
            busy.on = false;
          }
        }
      }
    ]
  });
}
