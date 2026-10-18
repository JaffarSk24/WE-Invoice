// Records the change log while the app runs: every local change of a
// document, contact, item or recurring template ("data:changed" with
// source 'local') becomes one auditLog record saying who (the Google
// account of sync, when signed in), on which device, what kind of change
// and which fields. Changes that arrive by sync are not logged again: the
// device that made them wrote their entry, and it syncs too. The recorder
// keeps the last seen version of each record to compare with.
import { auditEntryFor, AUDITED_COLLECTIONS } from '@we-invoice/core';
import { isDemo } from '../shell/demo-mode.js';
import { hasStore, getStore } from '../../store/index.js';

export function createAuditRecorder({ on, device = null, getStoreFn = () => (hasStore() ? getStore() : null), demo = isDemo, onError = null }) {
  const snapshots = new Map();
  let actor = null;
  let queue = Promise.resolve();
  let warned = false;

  const storeOrNull = () => {
    try { return getStoreFn(); } catch (e) { console.warn('Store not available for the change log', e); return null; }
  };

  function snapshot(name) {
    const store = storeOrNull();
    const map = new Map();
    if (store) store.list(name, { includeDeleted: true }).forEach(r => map.set(r.id, r));
    snapshots.set(name, map);
    return map;
  }

  function snapshotAll() {
    Object.keys(AUDITED_COLLECTIONS).forEach(snapshot);
  }

  function write(store, fields) {
    queue = queue.then(() => store.insert('auditLog', fields)).catch(e => {
      console.error('The change log entry could not be saved', e);
      if (!warned && onError) { warned = true; onError(e); }
    });
    return queue;
  }

  function handle({ collection, id, source } = {}) {
    if (collection === 'auditLog') return null;
    if (source !== 'local' || !collection || !id) {
      // Synced data: take the new versions as the base for later changes.
      if (!collection || collection === 'company') snapshotAll(); else if (AUDITED_COLLECTIONS[collection]) snapshot(collection);
      return null;
    }
    if (!AUDITED_COLLECTIONS[collection] || demo()) return null;
    const store = storeOrNull();
    if (!store || store.readOnly) return null;
    const map = snapshots.get(collection) || new Map();
    snapshots.set(collection, map);
    const before = map.get(id) || null;
    const after = store.get(collection, id, { includeDeleted: true });
    if (after) map.set(id, after);
    const fields = auditEntryFor({ collection, before, after, at: new Date().toISOString(), actor, device });
    return fields ? write(store, fields) : null;
  }

  function start() {
    snapshotAll();
    const offs = [
      on('data:changed', handle),
      on('company:switched', snapshotAll),
      on('sync:status', (state) => { actor = (state && state.email) || null; })
    ];
    return () => offs.forEach(off => off());
  }

  return { start, handle, flush: () => queue, setActor: (value) => { actor = value || null; } };
}
