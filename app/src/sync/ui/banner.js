// Sync banner over the page, as in WE Budget: it stays while sync cannot run
// and says what to do, instead of a toast that disappears. Two cases:
//   renew   the web app's hour of access to Google is over: "Sign in again"
//   locked  the data in Drive is encrypted and this device has no key yet:
//           "Unlock" (the encryption password or the recovery key)
// "Later" hides it until the status changes.
import { h, clear, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';

export function createSyncBanner({ el, t, onRenew, onUnlock }) {
  let status = null;
  let hiddenFor = null;

  function render() {
    if (!el) return;
    clear(el);
    const show = (status === 'renew' || status === 'locked') && hiddenFor !== status;
    el.hidden = !show;
    if (!show) return;
    const renew = status === 'renew';
    el.append(
      h('div', { class: 'update-banner-text' }, icon(renew ? 'cloud-off' : 'lock'),
        h('div', {},
          h('strong', {}, t(renew ? 'sync.banner.renewTitle' : 'sync.banner.lockedTitle')), ' ',
          h('span', {}, t(renew ? 'sync.banner.renewText' : 'sync.banner.lockedText')))),
      h('div', { class: 'update-banner-actions' },
        h('button', { type: 'button', class: 'btn btn-sm btn-primary', onclick: renew ? onRenew : onUnlock },
          icon(renew ? 'log-in' : 'key-round'), t(renew ? 'sync.signIn.renewButton' : 'sync.banner.unlock')),
        h('button', { type: 'button', class: 'btn btn-sm btn-secondary', onclick: () => { hiddenFor = status; render(); } }, t('sync.banner.later'))));
    refreshIcons(el);
  }

  return {
    update(state) {
      const next = state && state.status;
      if (next !== status) hiddenFor = null;
      status = next;
      render();
    },
    state: () => ({ status, hiddenFor })
  };
}
