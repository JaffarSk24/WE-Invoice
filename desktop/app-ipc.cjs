// IPC of the app itself: info for the page, system notifications, the
// "start at login" option, the tray state sent by the page and the update
// commands. Each handler is small and delegates to its module; the modules
// come in through `deps` so this file needs no Electron of its own.
const { ACTIONS } = require('./tray-menu.cjs');

const APP_NAME = 'WE Invoice';

function isHttpsUrl(url) {
  try {
    return new URL(String(url)).protocol === 'https:';
  } catch (e) {
    return false;
  }
}

// deps = { app, shell, Notification, windows, tray, updater, platform }
function initAppIpc(ipcMain, deps) {
  const { app, shell, Notification, windows, tray, updater, platform = process.platform } = deps;

  ipcMain.handle('app:info', () => ({
    name: APP_NAME,
    version: app.getVersion(),
    platform,
    arch: process.arch,
    packaged: app.isPackaged,
    canInstallUpdates: updater.canInstallInPlace()
  }));

  // A click on the notification brings the window back.
  ipcMain.handle('app:notify', (_e, title, body) => {
    try {
      if (!Notification.isSupported()) return false;
      const note = new Notification({ title: String(title || APP_NAME).slice(0, 200), body: String(body || '').slice(0, 1000) });
      note.on('click', () => windows.show());
      note.show();
      return true;
    } catch (e) {
      console.error('[notify]', e.message);
      return false;
    }
  });

  ipcMain.handle('app:open-external', (_e, url) => {
    if (!isHttpsUrl(url)) return false;
    shell.openExternal(String(url));
    return true;
  });

  // "Spúšťať pri prihlásení": the app starts hidden, in the tray, so the
  // scheduler runs without a window in the way.
  ipcMain.handle('app:login-item:get', () => {
    try {
      const settings = app.getLoginItemSettings({ args: ['--hidden'] });
      return { enabled: Boolean(settings.openAtLogin), supported: platform === 'darwin' || platform === 'win32' };
    } catch (e) {
      console.warn('[login-item]', e.message);
      return { enabled: false, supported: false };
    }
  });
  ipcMain.handle('app:login-item:set', (_e, enabled) => {
    try {
      app.setLoginItemSettings({ openAtLogin: enabled === true, openAsHidden: true, args: ['--hidden'] });
      return { ok: true, enabled: enabled === true };
    } catch (e) {
      console.error('[login-item]', e.message);
      return { ok: false, error: 'LOGIN_ITEM_FAILED' };
    }
  });

  // A window hidden in the tray must come back when the tray goes away,
  // otherwise the app would run invisibly.
  ipcMain.on('tray:state', (_e, state) => {
    const shown = tray.update(state).show;
    if (!shown && windows.isOpen() && !windows.isVisible()) windows.show();
  });

  ipcMain.handle('updates:check', () => updater.check());
  ipcMain.handle('updates:download', () => updater.download((p) => windows.send('updates:progress', p)));
  ipcMain.handle('updates:install', () => {
    const result = updater.install();
    // Quitting goes through the normal close path, so unsent changes reach
    // the cloud before the new version replaces this one.
    if (result.ok && result.quit) setTimeout(() => app.quit(), 100);
    return result;
  });
}

module.exports = { initAppIpc, isHttpsUrl, APP_NAME, TRAY_ACTIONS: ACTIONS };
