// Start-up of the sync module (WP-SYNC): the store, the vault and the sync
// engine, and the dialogs that the engine's status asks for (sign-in, the
// encryption password, unlocking). Called once, in the order of
// boot/index.js, after the language and the transport are ready.
import { createStore } from '../store/index.js';
import { connectStore, adoptLocalCompany } from '../store/bridge.js';
import { SyncEngine } from '../sync/engine.js';
import { Vault } from '../sync/vault.js';
import { deviceKeyring } from '../sync/keyring.js';
import { handleAuthCallback } from '../sync/google/auth-web.js';
import { setEngine } from '../sync/index.js';
import { openSignInModal } from '../sync/ui/signin.js';
import { openSetupModal } from '../sync/ui/setup.js';
import { openUnlockModal } from '../sync/ui/unlock.js';
import { createSyncBanner } from '../sync/ui/banner.js';
import '../style/update-banner.css';
import { topBanner } from '../ui/top-banners.js';

const DISMISSED = 'we-invoice-signin-dismissed';

function dismissedThisSession() {
  try { return sessionStorage.getItem(DISMISSED) === '1'; } catch (e) { return false; }
}

function dismiss() {
  try { sessionStorage.setItem(DISMISSED, '1'); } catch (e) { /* session only */ }
}

export async function boot(ctx) {
  const { transport, t, showToast, showError, on, emit } = ctx;
  // The page may be Google's answer in the sign-in window: it stores the
  // token for the app and closes; nothing else should start in it.
  if (transport.platform === 'web' && handleAuthCallback()) return;

  const store = createStore({ emitter: emit });
  await store.open();
  connectStore(store, { on, emit, showError });
  try {
    await adoptLocalCompany(store);
  } catch (e) {
    console.error('The company kept on this device could not be moved to the store', e);
  }
  const vault = new Vault(deviceKeyring(transport));
  if (transport.secrets && typeof transport.secrets.useKey === 'function') transport.secrets.useKey(() => vault.key);
  const engine = new SyncEngine({ store, transport, vault, emit, readme: t('sync.drive.readme') });
  setEngine(engine);

  // A banner that stays while sync cannot run, as in WE Budget.
  const bannerEl = topBanner('sync-banner', 'alert');
  const banner = createSyncBanner({
    el: bannerEl, t,
    onRenew: () => openSignInModal({ engine, renew: true }),
    onUnlock: () => openUnlockModal({ engine, showToast })
  });

  const dialogs = { setup: false, locked: false };
  on('sync:status', (state) => {
    banner.update(state);
    if (state.status === 'setup' && !dialogs.setup) {
      dialogs.setup = true;
      openSetupModal({ engine, transport, showToast, showError });
    }
    if (state.status === 'locked' && !dialogs.locked) {
      dialogs.locked = true;
      openUnlockModal({ engine, showToast });
    }
    if (state.status !== 'locked') dialogs.locked = false;
    if (state.status === 'error' && state.error) showError({ code: state.error });
  });
  on('sync:conflicts', ({ conflicts, renumbered }) => {
    if (renumbered) showToast(t('sync.conflicts.renumbered', { count: renumbered }), { type: 'info', duration: 12000 });
    const locked = conflicts.filter(c => c.locked).length;
    if (locked) showToast(t('sync.conflicts.locked', { count: locked }), { type: 'error', duration: 15000 });
  });

  if (store.readOnly) showToast(t('sync.readOnly'), { type: 'error', duration: 15000 });
  const state = await engine.init();
  // Not connected: an offer that does not block the app (a dialog over the
  // first screen would stop people who only want to look around).
  if (state.status === 'off' && !dismissedThisSession()) {
    dismiss();
    showToast(t('sync.signIn.text'), { type: 'info', actionLabel: t('sync.signIn.button'), onAction: () => openSignInModal({ engine }), duration: 20000 });
  }
}
