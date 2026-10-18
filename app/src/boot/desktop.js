// Start-up of the desktop module (WP-DESKTOP). Does nothing in the browser.
// In the Electron build it wires the preload bridges to the event bus:
//   app:before-close { wait(promise) }   modules finish before the window closes
//   desktop:tray (in)                     { show, dueTotal, currency, overdueCount, canReceive }
//                                         from the sales module; the tray is redrawn
//   invoice:new / peppol:receive (out)    a tray action was chosen (after navigating)
//   scheduler:recurring / :reminders / :efaktury (out)  { at } the main process
//                                         woke the page for a background task
//   app:deep-link (out)                   a weinvoice:// link (after navigating)
// It also registers the #/desktop settings screen and checks for updates.
import { hasRoute } from '../router.js';
import { currentLang } from '../i18n/index.js';
import { APP_VERSION } from '../config.js';
import { initCloseHandshake } from '../desktop/close.js';
import { createUpdates } from '../desktop/updates.js';
import { buildTrayState, TRAY_ACTIONS } from '../desktop/tray-state.js';
import { getDesktopPrefs } from '../desktop/prefs.js';

export function isDesktopWindow(win) {
  return Boolean(win && win.wePlatform && win.weApp);
}

// Everything the module keeps between calls, for tests and the settings view.
export function createDesktopModule(ctx, win) {
  const { t, emit, on, navigate, showToast, showError } = ctx;
  const bridges = { weApp: win.weApp, weTray: win.weTray, weScheduler: win.weScheduler, weStorage: win.weStorage, weMail: win.weMail, weSecrets: win.weSecrets, weUpdates: win.weUpdates };
  let summary = null;

  // The tray is there as soon as the option is on; the amounts appear once
  // the sales module sends its summary.
  function refreshTray() {
    if (!bridges.weTray) return;
    const state = buildTrayState({ ...(summary || {}), show: getDesktopPrefs().tray && (summary === null || summary.show !== false) }, t, currentLang());
    bridges.weTray.setState(state);
  }

  function onTrayAction(id) {
    const action = TRAY_ACTIONS[id];
    if (!action) return;
    if (hasRoute(action.route)) navigate(action.route);
    emit(action.event, { source: 'tray' });
  }

  function onDeepLink(link) {
    if (!link || !link.route) return;
    if (hasRoute(link.route)) navigate(link.route);
    emit('app:deep-link', link);
  }

  const updates = createUpdates({ weUpdates: bridges.weUpdates, t, showToast, showError });

  function start() {
    initCloseHandshake(bridges.weApp, emit);
    on('desktop:tray', (s) => { summary = s; refreshTray(); });
    on('language:changed', refreshTray);
    if (bridges.weTray) bridges.weTray.onAction(onTrayAction);
    refreshTray();
    if (bridges.weScheduler) bridges.weScheduler.onTick(({ kind, at }) => emit(`scheduler:${kind}`, { at }));
    bridges.weApp.onDeepLink(onDeepLink);
    bridges.weApp.pendingLink().then(link => { if (link) onDeepLink(link); }).catch(e => console.warn('Pending link unknown', e));
    updates.start();
    ctx.registerRoute('desktop', (root) => {
      import('../views/desktop/settings.js')
        .then(mod => mod.renderDesktopSettings(root, { t, lang: currentLang(), showToast, showError, bridges, updates, refreshTray, version: APP_VERSION }))
        .catch(showError);
    });
  }

  return { start, refreshTray, onTrayAction, onDeepLink, updates, bridges };
}

export async function boot(ctx, win = typeof window !== 'undefined' ? window : null) {
  if (!isDesktopWindow(win)) return null;
  const module = createDesktopModule(ctx, win);
  module.start();
  return module;
}
