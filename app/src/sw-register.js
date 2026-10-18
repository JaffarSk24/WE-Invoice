// Registers the service worker of the web build (offline shell). When a new
// version is waiting, the worker takes over on the next start; WP-UI adds
// the "Nová verzia" notice.
import { IS_WEB_BUILD } from './config.js';

export function registerServiceWorker() {
  if (!IS_WEB_BUILD || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker not registered', e));
}
