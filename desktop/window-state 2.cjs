// Remembers the position and size of the main window between runs
// (userData/window-state.json) and makes sure a remembered window still
// fits a display: a monitor that was unplugged must not leave the window
// off screen. The fitting is pure, so it is tested without Electron.
const fs = require('fs');
const path = require('path');

const MIN_WIDTH = 1024;
const MIN_HEIGHT = 700;
const DEFAULT_WIDTH = 1360;
const DEFAULT_HEIGHT = 880;
const STATE_FILE = 'window-state.json';
// How much of the window must be visible for the saved position to be kept.
const MIN_VISIBLE = 100;

function isNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

// Does a window at `bounds` overlap a display's work area enough to be
// reachable with the mouse?
function isVisibleOn(bounds, area) {
  const left = Math.max(bounds.x, area.x);
  const right = Math.min(bounds.x + bounds.width, area.x + area.width);
  const top = Math.max(bounds.y, area.y);
  const bottom = Math.min(bounds.y + bounds.height, area.y + area.height);
  return right - left >= MIN_VISIBLE && bottom - top >= MIN_VISIBLE;
}

// The bounds to open with: the saved ones when they are sane and visible on
// one of the `workAreas`, otherwise a default-sized window centred on the
// primary work area (the first one). Sizes never go under the minimum.
function fitBounds(saved, workAreas) {
  const primary = (workAreas && workAreas[0]) || { x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  const width = Math.max(MIN_WIDTH, Math.min(isNumber(saved && saved.width) ? saved.width : DEFAULT_WIDTH, primary.width));
  const height = Math.max(MIN_HEIGHT, Math.min(isNumber(saved && saved.height) ? saved.height : DEFAULT_HEIGHT, primary.height));
  const candidate = saved && isNumber(saved.x) && isNumber(saved.y) ? { x: saved.x, y: saved.y, width, height } : null;
  if (candidate && (workAreas || []).some(area => isVisibleOn(candidate, area))) {
    return { ...candidate, maximized: saved.maximized === true };
  }
  return {
    x: Math.round(primary.x + (primary.width - width) / 2),
    y: Math.round(primary.y + (primary.height - height) / 2),
    width,
    height,
    maximized: Boolean(saved && saved.maximized === true)
  };
}

function readState(userData) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(userData, STATE_FILE), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    return null;
  }
}

function writeState(userData, state) {
  try {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, STATE_FILE), JSON.stringify(state), 'utf8');
  } catch (e) {
    console.warn('[window] state not saved', e.message);
  }
}

// Watches a BrowserWindow and saves its bounds a moment after they change.
function trackWindow(win, userData, { delayMs = 400 } = {}) {
  let timer = null;
  const save = () => {
    if (!win || win.isDestroyed()) return;
    const maximized = win.isMaximized();
    // The bounds of a maximized window are the display's: keep the last
    // normal ones instead so that un-maximizing later makes sense.
    const bounds = maximized ? win.getNormalBounds() : win.getBounds();
    writeState(userData, { ...bounds, maximized });
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(save, delayMs); };
  ['resize', 'move', 'maximize', 'unmaximize'].forEach(ev => win.on(ev, schedule));
  win.on('close', () => { clearTimeout(timer); save(); });
}

module.exports = { fitBounds, readState, writeState, trackWindow, MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT, STATE_FILE };
