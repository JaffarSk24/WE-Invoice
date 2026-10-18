// Updates on the desktop, as in WE Budget: at every start and once a day
// while the app keeps running (in the tray it may run for weeks) it asks
// GitHub for the latest release; when there is a newer
// one, a banner over the page offers "Update", "What's new" and "Later".
// The banner then shows the download progress, and "Restart and update"
// once the file is downloaded and its sha512 verified by the main process
// (desktop/updater.cjs). Your data stays: only the app is replaced.
import { h, clear, icon } from '../ui/dom.js';
import { refreshIcons } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';

const START_DELAY_MS = 2500;
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

export function createUpdates({ weUpdates, t, showToast, showError, setTimer = setTimeout, setRepeat = setInterval }) {
  // status: idle | checking | available | downloading | ready | installing | manual | failed
  let state = { status: 'idle', latest: null, current: null, notes: '', progress: 0, result: null, dismissed: null };
  const listeners = new Set();

  function set(patch) {
    state = { ...state, ...patch };
    listeners.forEach(fn => fn(state));
  }

  async function install() {
    set({ status: 'installing' });
    const result = await weUpdates.install();
    if (!result.ok) {
      set({ status: 'ready' });
      showError(Object.assign(new Error(result.error || 'update_install'), { code: 'UPDATE_INSTALL' }));
      return;
    }
    if (result.manual) {
      set({ status: 'manual' });
      showToast(t('desktop.updates.manual'), { type: 'info', duration: 15000 });
    }
  }

  async function download() {
    if (state.status === 'downloading') return;
    set({ status: 'downloading', progress: 0 });
    const result = await weUpdates.download();
    if (!result.ok) {
      set({ status: 'available', result });
      showToast(t('desktop.updates.downloadFailed'), { type: 'error' });
      return;
    }
    set({ status: result.inPlace === false ? 'manual' : 'ready', result });
  }

  // `quiet`: the automatic checks say nothing when there is no update.
  async function check({ quiet = false } = {}) {
    if (!weUpdates) return null;
    if (['downloading', 'ready', 'installing'].includes(state.status)) return state.result;
    set({ status: 'checking' });
    const result = await weUpdates.check();
    if (!result.ok) {
      set({ status: 'failed', result });
      if (!quiet) showToast(t('desktop.updates.failed'), { type: 'error' });
      return result;
    }
    const base = { result, latest: result.latest || null, current: result.current || null, notes: result.notes || '' };
    if (!result.available) {
      set({ ...base, status: 'idle' });
      if (!quiet) showToast(t('desktop.updates.upToDate'), { type: 'info' });
      return result;
    }
    // A manual check shows the banner again after "Later".
    set({ ...base, status: 'available', dismissed: quiet ? state.dismissed : null });
    return result;
  }

  function showNotes() {
    openModal({
      title: t('desktop.updates.notesTitle', { version: state.latest }),
      body: h('div', { class: 'release-notes' }, state.notes || t('desktop.updates.noNotes')),
      actions: [{ label: t('common.close'), onClick: (m) => m.close() }]
    });
  }

  function renderBanner(el) {
    clear(el);
    const show = state.latest && state.dismissed !== state.latest
      && ['available', 'downloading', 'ready', 'installing', 'manual'].includes(state.status);
    el.hidden = !show;
    if (!show) return;
    const actions = [];
    let text;
    const button = (label, onClick, kind = 'btn-secondary', iconName = null) =>
      h('button', { type: 'button', class: `btn btn-sm ${kind}`, onclick: onClick }, iconName ? icon(iconName) : null, label);
    if (state.status === 'downloading') {
      text = t('desktop.updates.downloading', { percent: Math.round(state.progress * 100) });
    } else if (state.status === 'ready') {
      text = t('desktop.updates.readyLong', { version: state.latest });
      actions.push(button(t('desktop.updates.install'), install, 'btn-primary', 'rotate-ccw'));
    } else if (state.status === 'installing') {
      text = t('desktop.updates.installing');
    } else if (state.status === 'manual') {
      text = t('desktop.updates.manual');
    } else {
      text = t('desktop.updates.availableLong', { version: state.latest, current: state.current || '' });
      actions.push(
        button(t('desktop.updates.download'), download, 'btn-primary', 'download'),
        button(t('desktop.updates.whatsNew'), showNotes),
        button(t('desktop.updates.later'), () => set({ dismissed: state.latest })));
    }
    el.append(h('div', { class: 'update-banner-text' }, icon('sparkles'), h('span', {}, text)));
    if (state.status === 'downloading') {
      el.append(h('div', { class: 'update-progress', role: 'progressbar', 'aria-valuenow': String(Math.round(state.progress * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100' },
        h('div', { class: 'update-progress-bar', style: { width: `${Math.round(state.progress * 100)}%` } })));
    }
    if (actions.length) el.append(h('div', { class: 'update-banner-actions' }, actions));
    refreshIcons(el);
  }

  // `bannerEl`: the element over the page the banner lives in.
  function start(bannerEl = null) {
    if (!weUpdates) return;
    weUpdates.onProgress((p) => set({ progress: Number(p) || 0 }));
    if (bannerEl) listeners.add(() => renderBanner(bannerEl));
    const quietCheck = () => check({ quiet: true }).catch(e => console.error('Update check failed', e));
    setTimer(quietCheck, START_DELAY_MS);
    setRepeat(quietCheck, CHECK_EVERY_MS);
  }

  return {
    start, check, download, install, renderBanner,
    state: () => state,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}
