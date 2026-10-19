// The "Synchronizácia" section of Settings: the state of the connection to
// Google Drive and what the person can do with it: sign in or out, sync
// now, turn encryption on, unlock this device, change the password. The
// dialogs are the ones the engine already asks for; this section only
// opens them on purpose. It redraws on every sync:status.
import { h, append, clear } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { showToast, showError } from '../../ui/toast.js';
import { formatDateTime } from '../../components/dates.js';
import { normalizeSyncStatus, syncTextKey } from '../../views/shell/sync-state.js';
import { openSignInModal } from './signin.js';
import { openSetupModal } from './setup.js';
import { openUnlockModal } from './unlock.js';
import { openChangePasswordModal } from './change-password.js';

const button = (id, label, onclick, primary = false) => h('button', { type: 'button', class: primary ? 'btn btn-primary' : 'btn', id, onclick }, label);

/** The buttons for an engine state (pure, for the tests). */
export function syncActions(state) {
  const signedIn = state.status !== 'off' && state.status !== 'unavailable';
  const actions = [];
  if (!signedIn) actions.push('signIn');
  if (signedIn && state.status !== 'locked' && state.status !== 'setup') actions.push('sync');
  if (state.locked) actions.push('unlock');
  if (!state.encrypted) actions.push('encrypt');
  if (state.encrypted && !state.locked) actions.push('changePassword');
  if (signedIn) actions.push('signOut');
  return actions;
}

export function createSyncSection({ engine, transport }) {
  return function syncSection(container) {
    const body = h('div', { class: 'sync-settings' });
    const run = (fn) => Promise.resolve().then(fn).catch(e => showError(e));
    const handlers = {
      signIn: () => openSignInModal({ engine }),
      sync: () => run(async () => {
        const result = await engine.sync('manual');
        if (result && !result.ok && result.error) showError({ code: result.error });
      }),
      unlock: () => openUnlockModal({ engine, showToast }),
      encrypt: () => openSetupModal({ engine, transport, showToast, showError }),
      changePassword: () => openChangePasswordModal({ engine, showToast }),
      signOut: () => run(() => engine.signOut())
    };
    const labels = {
      signIn: t('sync.signIn.button'), sync: t('sync.button'), unlock: t('sync.unlock.button'), encrypt: t('sync.password.title'),
      changePassword: t('sync.change.title'), signOut: t('sync.signOut')
    };

    function draw() {
      const state = engine.state;
      clear(body);
      append(body, [
        h('p', { class: 'sync-settings-status', id: 'settings-sync-status' }, t(syncTextKey(normalizeSyncStatus(state).status))),
        state.email ? h('p', { class: 'muted' }, t('sync.signedInAs', { email: state.email })) : null,
        state.lastSyncAt ? h('p', { class: 'muted small' }, t('sync.lastSync', { time: formatDateTime(state.lastSyncAt) })) : null,
        h('p', { class: 'muted' }, t('sync.signIn.text')),
        h('div', { class: 'exim-actions' }, syncActions(state).map(a => button(`settings-sync-${a}`, labels[a], handlers[a], a === 'signIn' || a === 'sync')))
      ]);
    }

    draw();
    container.append(body);
    const off = on('sync:status', () => {
      if (!body.isConnected) { off(); return; }
      draw();
    });
  };
}
