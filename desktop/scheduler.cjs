// The background scheduler (02-architecture.md § 2.8): while the app runs,
// also hidden in the tray, it wakes the page for recurring invoices and
// payment reminders once an hour and at start, and for receiving eFaktúry
// every 15 minutes. The page does the work (the modules own the logic);
// the main process only keeps time, also across sleep, and remembers the
// last runs so a restart does not repeat them at once.
const fs = require('fs');
const path = require('path');
const { dueTasks, markRun, CHECK_EVERY_MS, TASK_KINDS } = require('./scheduler-plan.cjs');

const STATE_FILE = 'scheduler-state.json';
// The page gets a moment to start before the first wake-up.
const FIRST_CHECK_DELAY_MS = 15000;

function readState(userData) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(userData, STATE_FILE), 'utf8'));
    return parsed && typeof parsed === 'object' ? { lastRuns: parsed.lastRuns || {}, disabled: parsed.disabled || [] } : { lastRuns: {}, disabled: [] };
  } catch (e) {
    return { lastRuns: {}, disabled: [] };
  }
}

function writeState(userData, state) {
  try {
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(path.join(userData, STATE_FILE), JSON.stringify(state), 'utf8');
  } catch (e) {
    console.warn('[scheduler] state not saved', e.message);
  }
}

// `send(kind, at)` delivers the wake-up to the page; it returns false when
// no page is there to take it, and the task stays due.
function createScheduler({ userData, send, now = Date.now, timers = { setInterval, clearInterval, setTimeout, clearTimeout } }) {
  const state = readState(userData);
  let interval = null;
  let firstTimer = null;

  function check(force = false) {
    const at = now();
    const due = force ? TASK_KINDS.filter(k => !state.disabled.includes(k)) : dueTasks(state.lastRuns, at, { disabled: state.disabled });
    const delivered = due.filter(kind => send(kind, at) !== false);
    if (delivered.length) {
      state.lastRuns = markRun(state.lastRuns, delivered, at);
      writeState(userData, state);
    }
    return delivered;
  }

  return {
    start() {
      if (interval) return;
      firstTimer = timers.setTimeout(() => check(), FIRST_CHECK_DELAY_MS);
      interval = timers.setInterval(() => check(), CHECK_EVERY_MS);
    },
    stop() {
      timers.clearTimeout(firstTimer);
      timers.clearInterval(interval);
      interval = null;
    },
    // After sleep the clock jumped: look right away.
    resume: () => check(),
    runNow: (kind) => (TASK_KINDS.includes(kind) ? (send(kind, now()) !== false ? [kind] : []) : check(true)),
    setDisabled(kinds) {
      state.disabled = (Array.isArray(kinds) ? kinds : []).filter(k => TASK_KINDS.includes(k));
      writeState(userData, state);
      return state.disabled;
    },
    state: () => ({ lastRuns: { ...state.lastRuns }, disabled: [...state.disabled], kinds: [...TASK_KINDS] })
  };
}

function initSchedulerIpc(ipcMain, scheduler) {
  ipcMain.handle('scheduler:state', () => scheduler.state());
  ipcMain.handle('scheduler:run-now', (_e, kind) => scheduler.runNow(kind));
  ipcMain.handle('scheduler:set-disabled', (_e, kinds) => scheduler.setDisabled(kinds));
}

module.exports = { createScheduler, initSchedulerIpc, FIRST_CHECK_DELAY_MS, STATE_FILE };
