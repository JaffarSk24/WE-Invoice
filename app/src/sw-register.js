// Registers the service worker of the web build (offline shell) and tells
// the user when a new version has arrived. The worker activates at once
// (skipWaiting in app/build/service-worker.js), so the page already runs
// the old files while the new ones are cached: a large window over the app
// asks to reload, so nobody keeps working in the old version unaware.
import { IS_WEB_BUILD } from './config.js';
import { t } from './i18n/index.js';
import { h, icon } from './ui/dom.js';
import { refreshIcons } from './ui/icons.js';
import { openModal } from './ui/modal.js';

let noticeShown = false;

export function showUpdateNotice(reload = () => location.reload()) {
  if (noticeShown) return;
  noticeShown = true;
  const body = h('div', { class: 'update-popup' },
    h('div', { class: 'update-popup-hero' }, icon('sparkles'),
      h('div', {}, h('p', { class: 'update-popup-lead' }, t('pwa.popupLead')), h('p', { class: 'muted' }, t('pwa.popupSafe')))));
  let modal = null;
  body.append(h('div', { class: 'update-popup-actions' },
    h('button', { type: 'button', class: 'btn btn-brand btn-lg', id: 'pwa-update-reload', onclick: reload }, icon('rotate-ccw'), t('pwa.reload')),
    h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => modal && modal.close() }, t('pwa.later'))));
  refreshIcons(body);
  modal = openModal({ title: t('pwa.popupTitle'), body, wide: true });
}

// Watches a registration: an installing worker that finishes while the
// page was already controlled at start is an update of a running app.
// The first install also takes control (clients.claim), so the check uses
// the controller seen before registering, not the one seen later.
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
  const controlledAtStart = Boolean(navigator.serviceWorker.controller);
  const hadController = () => controlledAtStart;
  navigator.serviceWorker.register('./sw.js')
    .then(registration => watchForUpdates(registration, hadController))
    .catch(e => console.warn('Service worker not registered', e));
}
