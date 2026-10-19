// The sync status line at the bottom of the menu, as in WE Budget. The sync
// engine (WP-SYNC) emits sync:status; until it does, the line is neutral.
//
//   sync:status  { status, at?, message? }  or the status string alone
//   status       'local' | 'idle' | 'syncing' | 'ok' | 'error' | 'offline'
//                | 'signedOut' | 'locked' | 'reauth'
//
// The engine (sync/engine.js) has its own words for some states; they are
// mapped here, so a device that is not signed in never reads as synced.
// Unknown statuses are shown as neutral so a new engine state never breaks
// the shell.
import { on } from '../../events.js';

export const SYNC_STATUSES = Object.freeze(['local', 'idle', 'syncing', 'ok', 'error', 'offline', 'signedOut', 'locked', 'reauth']);

const ICONS = Object.freeze({
  local: 'hard-drive', idle: 'cloud', syncing: 'refresh-cw', ok: 'cloud-check', error: 'cloud-alert',
  offline: 'cloud-off', signedOut: 'cloud', locked: 'lock', reauth: 'key-round'
});

const state = { status: 'local', at: null, message: null };
const listeners = new Set();
let started = false;

const ENGINE_STATUSES = Object.freeze({ off: 'local', unavailable: 'local', checking: 'syncing', setup: 'locked', renew: 'reauth' });

export function normalizeSyncStatus(payload) {
  const raw = payload && typeof payload === 'object' ? payload : { status: payload };
  const mapped = ENGINE_STATUSES[raw.status] || raw.status;
  const status = SYNC_STATUSES.includes(mapped) ? mapped : 'idle';
  return { status, at: raw.at || null, message: raw.message || null };
}

export function syncState() {
  return { ...state };
}

export function syncIcon(status) {
  return ICONS[status] || ICONS.idle;
}

// The i18n key of the text for a status.
export function syncTextKey(status) {
  return `sync.status.${SYNC_STATUSES.includes(status) ? status : 'idle'}`;
}

export function onSyncChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initSyncState() {
  if (started) return;
  started = true;
  on('sync:status', (payload) => {
    Object.assign(state, normalizeSyncStatus(payload));
    listeners.forEach(fn => {
      try { fn(syncState()); } catch (e) { console.error('Sync listener failed', e); }
    });
  });
}

export function resetSyncState() {
  Object.assign(state, { status: 'local', at: null, message: null });
  listeners.clear();
  started = false;
}
