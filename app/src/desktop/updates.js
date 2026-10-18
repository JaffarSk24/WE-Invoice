// Updates on the desktop: a check shortly after start and on request from
// the settings, a toast with "Download" when a newer release exists, the
// progress while it downloads, then "Install and restart". The main
// process verifies the sha512 of the file (desktop/updater.cjs).

const START_DELAY_MS = 20000;

export function createUpdates({ weUpdates, t, showToast, showError, setTimer = setTimeout }) {
  let state = { status: 'idle', latest: null, progress: 0, result: null };
  const listeners = new Set();

  function set(patch) {
    state = { ...state, ...patch };
    listeners.forEach(fn => fn(state));
  }

  async function install() {
    const result = await weUpdates.install();
    if (!result.ok) {
      showError(new Error(result.error || 'update_install'));
      return;
    }
    if (result.manual) showToast(t('desktop.updates.manual'), { type: 'info', duration: 15000 });
  }

  async function download() {
    if (state.status === 'downloading') return;
    set({ status: 'downloading', progress: 0 });
    const result = await weUpdates.download();
    if (!result.ok) {
      set({ status: 'failed', result });
      showToast(t('desktop.updates.downloadFailed'), { type: 'error' });
      return;
    }
    set({ status: 'ready', result });
    showToast(t('desktop.updates.ready', { version: state.latest }), { type: 'success', duration: 0, actionLabel: t('desktop.updates.install'), onAction: install });
  }

  // `quiet`: the automatic check at start says nothing when there is no update.
  async function check({ quiet = false } = {}) {
    if (!weUpdates) return null;
    set({ status: 'checking' });
    const result = await weUpdates.check();
    if (!result.ok) {
      set({ status: 'failed', result });
      if (!quiet) showToast(t('desktop.updates.failed'), { type: 'error' });
      return result;
    }
    if (!result.available) {
      set({ status: 'idle', result, latest: result.latest || null });
      if (!quiet) showToast(t('desktop.updates.upToDate'), { type: 'info' });
      return result;
    }
    set({ status: 'available', latest: result.latest, result });
    showToast(t('desktop.updates.available', { version: result.latest }), { type: 'info', duration: 0, actionLabel: t('desktop.updates.download'), onAction: download });
    return result;
  }

  function start() {
    if (!weUpdates) return;
    weUpdates.onProgress((p) => set({ progress: Number(p) || 0 }));
    setTimer(() => { check({ quiet: true }).catch(e => console.error('Update check failed', e)); }, START_DELAY_MS);
  }

  return {
    start, check, download, install,
    state: () => state,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
