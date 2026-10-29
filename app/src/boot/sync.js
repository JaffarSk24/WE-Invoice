// Start-up of the sync module (WP-SYNC): the store, the vault and the sync
// engine, and the dialogs that the engine's status asks for (sign-in, the
// encryption password, unlocking). Called once, in the order of
// boot/index.js, after the language and the transport are ready.
import { bootStep } from './splash.js';
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
import { createSyncSection } from '../sync/ui/settings-section.js';
import { registerSettingsSection } from '../views/settings/registry.js';
import '../style/update-banner.css';
import { topBanner } from '../ui/top-banners.js';
import { localFiles, setRemoteFiles } from '../views/purchase/file-store.js';
import { setAttachmentFiles } from '../sync/attachments/registry.js';

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
  const engine = new SyncEngine({ store, transport, vault, emit, readme: t('sync.drive.readme'), localFiles });
  setEngine(engine);
  // Attachment files: a file this device lacks is taken from Drive when it
  // is read through the file store (purchase/file-store.js).
  setAttachmentFiles(engine.files);
  setRemoteFiles({ fetch: (id) => engine.files.fetch(id), added: (id) => engine.files.added(id), removed: (id) => engine.files.removed(id) });
  engine.files.refreshLocal();
  registerSettingsSection('sync', createSyncSection({ engine, transport }));

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
  // The wizard's encryption step: the same dialog as in the sync settings.
  // Keys can be made before signing in; they go to Drive with the data.
  on('encryption:setup', (request) => {
    if (!request) return;
    request.handled = true;
    if (engine.state && engine.state.encrypted) { request.result = true; return; }
    request.result = new Promise((resolve) => openSetupModal({ engine, transport, showToast, showError, onFinish: resolve }));
  });
  on('sync:conflicts', ({ conflicts, renumbered }) => {
    if (renumbered) showToast(t('sync.conflicts.renumbered', { count: renumbered }), { type: 'info', duration: 12000 });
    const locked = conflicts.filter(c => c.locked).length;
    if (locked) showToast(t('sync.conflicts.locked', { count: locked }), { type: 'error', duration: 15000 });
  });

  if (store.readOnly) showToast(t('sync.readOnly'), { type: 'error', duration: 15000 });
  // The start screen says what the wait is: the sync with Google Drive
  // runs before the first screen when the device is signed in.
  bootStep(0.25, t('boot.opening'));
  const offStart = on('sync:status', (s) => { if (s && s.status === 'syncing') bootStep(0.4, t('boot.syncing')); });
  let state;
  try {
    state = await engine.init();
  } finally {
    if (typeof offStart === 'function') offStart();
  }
  bootStep(0.55, t('boot.preparing'));
  // Not connected: an offer that does not block the app (a dialog over the
  // first screen would stop people who only want to look around).
  if (state.status === 'off' && !dismissedThisSession()) {
    dismiss();
    showToast(t('sync.signIn.text'), { type: 'info', actionLabel: t('sync.signIn.button'), onAction: () => openSignInModal({ engine }), duration: 20000 });
  }
}
