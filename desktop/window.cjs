// The main window: created with the remembered bounds (never off screen,
// never under 1024 x 700), external links sent to the browser, and a close
// that waits for the page to push unsent changes to the cloud. With the
// tray switched on, closing the window only hides it: the scheduler keeps
// working until the user quits from the tray or the app menu.
const { fitBounds, readState, trackWindow } = require('./window-state.cjs');

const APP_NAME = 'WE Invoice';
// Closing waits for the page to push unsent changes to the cloud, at most
// this long; a slow network must never trap the user in an app that will
// not close. Anything not sent stays local and goes up on the next start.
const CLOSE_SYNC_TIMEOUT_MS = 8000;

function isExternal(url, devPort) {
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !url.startsWith(`http://localhost:${devPort}`);
  } catch (e) {
    return false;
  }
}

// hooks = { hideOnClose(): boolean, needsFlush(): boolean }
function createMainWindow({ BrowserWindow, screen, shell, ipcMain, userData, preload, icon, devPort, hooks, closeTimeoutMs = CLOSE_SYNC_TIMEOUT_MS }) {
  let win = null;
  let lastUrl = null;
  let quitting = false;
  let closeAllowed = false;
  let closeRequested = false;

  function alive() {
    return win && !win.isDestroyed();
  }

  // Before the window goes away the page gets a chance to upload unsent
  // changes. It answers app:close-ready; the timeout covers a page that
  // hangs or is gone.
  function waitForPage(event) {
    event.preventDefault();
    if (closeRequested) return;
    closeRequested = true;
    let timer = null;
    const proceed = () => {
      clearTimeout(timer);
      // A late answer must not let a future window skip this step.
      ipcMain.removeListener('app:close-ready', proceed);
      closeAllowed = true;
      if (alive()) win.close();
    };
    timer = setTimeout(proceed, closeTimeoutMs);
    ipcMain.on('app:close-ready', proceed);
    win.webContents.send('app:before-close');
  }

  function onClose(event) {
    if (closeAllowed) return;
    if (!quitting && hooks.hideOnClose()) {
      event.preventDefault();
      win.hide();
      return;
    }
    if (hooks.needsFlush()) waitForPage(event);
  }

  function create(url, { show = true } = {}) {
    lastUrl = url;
    const bounds = fitBounds(readState(userData), screen.getAllDisplays().map(d => d.workArea));
    win = new BrowserWindow({
      x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
      minWidth: 1024,
      minHeight: 700,
      show,
      title: APP_NAME,
      icon,
      backgroundColor: '#090b11',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, preload }
    });
    if (bounds.maximized) win.maximize();
    trackWindow(win, userData);
    // External links open in the default browser, never inside the app.
    win.webContents.on('will-navigate', (event, target) => {
      if (isExternal(target, devPort)) {
        event.preventDefault();
        shell.openExternal(target);
      }
    });
    win.webContents.setWindowOpenHandler(({ url: target }) => {
      if (isExternal(target, devPort)) shell.openExternal(target);
      return { action: 'deny' };
    });
    win.on('close', onClose);
    win.on('closed', () => {
      win = null;
      closeAllowed = false;
      closeRequested = false;
    });
    win.loadURL(url);
    return win;
  }

  function show() {
    if (alive()) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } else if (lastUrl) {
      create(lastUrl);
    }
  }

  return {
    create,
    show,
    get: () => (alive() ? win : null),
    isOpen: () => alive(),
    isVisible: () => alive() && win.isVisible(),
    // Delivers an event to the page; false when there is no page.
    send(channel, ...args) {
      if (!alive()) return false;
      win.webContents.send(channel, ...args);
      return true;
    },
    setQuitting(value) { quitting = value; },
    isQuitting: () => quitting,
    // After the handshake the window closes without asking again.
    closeNow() { closeAllowed = true; if (alive()) win.close(); },
    reset() { closeAllowed = false; closeRequested = false; }
  };
}

module.exports = { createMainWindow, isExternal, APP_NAME, CLOSE_SYNC_TIMEOUT_MS };
