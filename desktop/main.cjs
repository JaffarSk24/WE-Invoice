// Electron main process of WE Invoice: one window, the app:// scheme, the
// application menu and the modules behind the preload bridges (storage,
// secrets, network, mail, tray, scheduler, updates, deep links, Google
// sign-in and Drive). Ported from WE Budget.
const { app, BrowserWindow, ipcMain, protocol, shell, screen, Menu, nativeImage, Tray, Notification, safeStorage, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { registerAppProtocol } = require('./app-protocol.cjs');
const { createStorage, initStorageIpc } = require('./storage.cjs');
const { Cloud, registerCloudIpc } = require('./cloud.cjs');
const { createSecrets, initSecretsIpc } = require('./secrets.cjs');
const { createNet, initNetIpc } = require('./net.cjs');
const { createMail, initMailIpc } = require('./mail.cjs');
const { createTray } = require('./tray.cjs');
const { createScheduler, initSchedulerIpc } = require('./scheduler.cjs');
const { createMainWindow } = require('./window.cjs');
const { initAppIpc } = require('./app-ipc.cjs');
const { registerDeepLinks } = require('./deep-link.cjs');
const updater = require('./updater.cjs');

const APP_NAME = 'WE Invoice';
const APP_ID = 'com.whiteeagles.weinvoice';
const DEV_PORT = 5173;
const ROOT = path.join(__dirname, '..');
const ICON = path.join(ROOT, 'icon.png');
const ASSETS = path.join(__dirname, 'assets');

let viteProcess = null;
let windows = null;
let tray = null;
let scheduler = null;
let cloud = null;
let pendingLink = null;

// One data folder for every way of starting the app (dev run and installed):
// appData/we-invoice-data, as in WE Budget.
app.setPath('userData', process.env.WE_INVOICE_USER_DATA || path.join(app.getPath('appData'), 'we-invoice-data'));

// A second start (a weinvoice:// link on Windows, a double click on the
// icon) only brings the running window back.
if (!app.requestSingleInstanceLock()) app.quit();

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

// macOS needs an application menu for copy, paste and undo in text fields.
function buildAppMenu() {
  const template = process.platform === 'darwin'
    ? [{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]
    : [{ role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Started by the login item (--hidden) or opened as hidden by macOS: no
// window, only the tray and the scheduler.
function startsHidden() {
  if (process.argv.includes('--hidden')) return true;
  try {
    return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAsHidden === true;
  } catch (e) {
    return false;
  }
}

function readProviders() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'packages', 'core', 'peppol', 'providers.json'), 'utf8'));
  } catch (e) {
    console.warn('[net] providers list not read', e.message);
    return null;
  }
}

function initModules() {
  const userData = app.getPath('userData');
  const storage = createStorage(userData);
  initStorageIpc(ipcMain, shell, storage);
  const secrets = createSecrets({ safeStorage, dir: path.join(userData, 'secrets') });
  initSecretsIpc(ipcMain, secrets);
  initNetIpc(ipcMain, createNet({ providers: readProviders(), userAgent: `WE-Invoice/${app.getVersion()}` }));
  initMailIpc(ipcMain, createMail({ secrets }));

  windows = createMainWindow({
    BrowserWindow, screen, shell, ipcMain, userData, devPort: DEV_PORT, icon: ICON,
    preload: path.join(__dirname, 'preload.cjs'),
    hooks: {
      hideOnClose: () => tray.isShown(),
      needsFlush: () => !cloud || cloud.isSignedIn()
    }
  });
  tray = createTray({
    Tray, Menu, nativeImage, assetsDir: ASSETS, iconPath: ICON,
    handlers: {
      action: (id) => { windows.show(); windows.send('tray:action', id); },
      open: () => windows.show(),
      quit: () => app.quit()
    }
  });
  scheduler = createScheduler({ userData, send: (kind, at) => windows.send('scheduler:tick', { kind, at }) });
  initSchedulerIpc(ipcMain, scheduler);
  initAppIpc(ipcMain, { app, shell, Notification, windows, tray, updater });
  updater.cleanup();

  // Google sign-in (PKCE through a loopback port) and Drive (drive.file).
  cloud = new Cloud({ electron: { shell }, userData, bundledDir: ROOT });
  registerCloudIpc(ipcMain, cloud);

  pendingLink = registerDeepLinks(app, (link) => {
    windows.show();
    if (!windows.send('app:deep-link', link)) pendingLink = link;
  });
  // The page asks for the link it was started with once it is ready.
  ipcMain.handle('app:pending-link', () => { const link = pendingLink; pendingLink = null; return link; });
}

// Waits for the Vite dev server instead of guessing how long it needs.
function waitForDevServer(url, attempts = 80) {
  const http = require('http');
  return new Promise((resolve) => {
    const tryOnce = (left) => {
      http.get(url, (res) => { res.resume(); resolve(true); })
        .on('error', () => (left <= 0 ? resolve(false) : setTimeout(() => tryOnce(left - 1), 250)));
    };
    tryOnce(attempts);
  });
}

async function startUrl() {
  if (process.env.NODE_ENV !== 'development') {
    registerAppProtocol(protocol, path.join(ROOT, 'dist'));
    return 'app://bundle/index.html';
  }
  const devUrl = `http://localhost:${DEV_PORT}`;
  if (!await waitForDevServer(devUrl, 2)) {
    viteProcess = spawn('npx', ['vite', '--config', 'app/vite.config.js'], { cwd: ROOT, shell: true, stdio: 'inherit' });
    await waitForDevServer(devUrl);
  }
  return devUrl;
}

app.whenReady().then(async () => {
  app.setName(APP_NAME);
  // Windows shows notifications only for an app with an identity.
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
  initModules();
  buildAppMenu();
  if (process.platform === 'darwin' && !app.isPackaged && app.dock) app.dock.setIcon(nativeImage.createFromPath(ICON));
  windows.create(await startUrl(), { show: !startsHidden() });
  scheduler.start();
  powerMonitor.on('resume', () => scheduler.resume());
});

app.on('second-instance', () => { if (windows) windows.show(); });
app.on('activate', () => { if (windows) windows.show(); });
app.on('before-quit', () => { if (windows) windows.setQuitting(true); });

// Without a tray there is nothing to do once the window is gone, on every
// platform; with the tray the scheduler keeps working.
app.on('window-all-closed', () => {
  if (!tray || !tray.isShown() || (windows && windows.isQuitting())) app.quit();
});

app.on('will-quit', () => {
  if (scheduler) scheduler.stop();
  if (viteProcess) {
    try { viteProcess.kill(); } catch (e) { console.warn('Dev server did not stop', e); }
  }
});

// By now the window is closed and unsent changes have gone up.
app.on('quit', () => updater.launchPendingInstaller());
