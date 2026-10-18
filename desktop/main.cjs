// Electron main process of WE Invoice: one window, the app:// scheme, the
// application menu and the bridges for the preload script. Ported from
// WE Budget; the tray, scheduler, Drive, network and SMTP bridges arrive
// with WP-DESKTOP and WP-SYNC.
const { app, BrowserWindow, ipcMain, protocol, shell, Menu, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { registerAppProtocol } = require('./app-protocol.cjs');

const APP_NAME = 'WE Invoice';
const APP_ID = 'com.whiteeagles.weinvoice';
const DEV_PORT = 5173;
const ROOT = path.join(__dirname, '..');

let mainWindow = null;
let viteProcess = null;
let lastUrl = null;

// One data folder for every way of starting the app (dev run and installed).
app.setPath('userData', process.env.WE_INVOICE_USER_DATA || path.join(app.getPath('appData'), APP_NAME));

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

function isExternal(url) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !url.startsWith(`http://localhost:${DEV_PORT}`);
  } catch (e) {
    return false;
  }
}

function createWindow(url) {
  lastUrl = url;
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 1024,
    minHeight: 700,
    title: APP_NAME,
    icon: path.join(ROOT, 'icon.png'),
    backgroundColor: '#090b11',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });
  // External links open in the default browser, never inside the app.
  mainWindow.webContents.on('will-navigate', (event, target) => {
    if (isExternal(target)) {
      event.preventDefault();
      shell.openExternal(target);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isExternal(target)) shell.openExternal(target);
    return { action: 'deny' };
  });
  mainWindow.loadURL(url);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function initIpc() {
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), name: APP_NAME, platform: process.platform, packaged: app.isPackaged }));
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

app.whenReady().then(async () => {
  app.setName(APP_NAME);
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
  initIpc();
  buildAppMenu();
  if (process.platform === 'darwin' && !app.isPackaged && app.dock) {
    app.dock.setIcon(nativeImage.createFromPath(path.join(ROOT, 'icon.png')));
  }
  if (process.env.NODE_ENV === 'development') {
    const devUrl = `http://localhost:${DEV_PORT}`;
    const ready = await waitForDevServer(devUrl, 2);
    if (!ready) {
      viteProcess = spawn('npx', ['vite', '--config', 'app/vite.config.js'], { cwd: ROOT, shell: true, stdio: 'inherit' });
      await waitForDevServer(devUrl);
    }
    createWindow(devUrl);
  } else {
    registerAppProtocol(protocol, path.join(ROOT, 'dist'));
    createWindow('app://bundle/index.html');
  }
});

app.on('activate', () => {
  if (!mainWindow && lastUrl) createWindow(lastUrl);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  if (viteProcess) {
    try { viteProcess.kill(); } catch (e) { console.warn('Dev server did not stop', e); }
  }
});
