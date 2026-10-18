// Sign-in with Google, and the renewal of the hour of access in the web
// app: one dialog, opened at start when the device is not connected and
// from the status when the token ran out.
import { h } from '../../ui/dom.js';
import { openModal } from '../../ui/modal.js';
import { t } from '../../i18n/index.js';
import { errorLine, paragraph } from './fields.js';

export function openSignInModal({ engine, renew = false, onDone = null }) {
  const error = errorLine();
  const busy = { on: false };
  const modal = openModal({
    title: t('sync.signIn.title'),
    body: h('div', {}, paragraph(renew ? 'sync.signIn.renewText' : 'sync.signIn.text'), error.el),
    actions: [
      { label: t('sync.signIn.later'), onClick: (m) => m.close() },
      {
        label: t(renew ? 'sync.signIn.renewButton' : 'sync.signIn.button'), kind: 'primary',
        onClick: async (m) => {
          if (busy.on) return;
          busy.on = true;
          error.clear();
          try {
            await engine.signIn();
            m.close();
            if (onDone) onDone();
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
