// Registers the service worker of the web build (offline shell) and tells
// the user when a new version has arrived. The worker activates at once
// (skipWaiting in app/build/service-worker.js), so the page already runs
// the old files while the new ones are cached: a toast offers to reload.
import { IS_WEB_BUILD } from './config.js';
import { t } from './i18n/index.js';
import { showToast } from './ui/toast.js';

let noticeShown = false;

export function showUpdateNotice(reload = () => location.reload()) {
  if (noticeShown) return;
  noticeShown = true;
  showToast(t('pwa.newVersion'), { type: 'info', actionLabel: t('pwa.reload'), onAction: reload, duration: 60 * 60 * 1000 });
}

// Watches a registration: an installing worker that finishes while a
// controller already exists is an update of a running app.
export function watchForUpdates(registration, hadController) {
  const watch = (worker) => {
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if ((worker.state === 'installed' || worker.state === 'activated') && hadController()) showUpdateNotice();
    });
  };
  watch(registration.installing);
  registration.addEventListener('updatefound', () => watch(registration.installing));
}

export function registerServiceWorker() {
  if (!IS_WEB_BUILD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  const hadController = () => Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.register('./sw.js')
    .then(registration => watchForUpdates(registration, hadController))
    .catch(e => console.warn('Service worker not registered', e));
}
