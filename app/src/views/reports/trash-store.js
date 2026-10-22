// Writes of the recycle bin. store.update() refuses deleted records (a
// tombstone is final for the views), so bringing one back or emptying it
// replaces the tombstone through the store's own commit step: the record
// keeps its id, gets a new change time, is saved and announced with
// "data:changed" like any other change, and syncs. When the store offers
// restore() and purge() (proposed in the store contract), those are used.
import { restoredRecord, purgedRecord } from '@we-invoice/core';

function nowOf(store) {
  return typeof store.now === 'function' ? store.now() : new Date().toISOString();
}

async function replaceTombstone(store, name, id, change) {
  store.assertCompany();
  const records = store.list(name, { includeDeleted: true });
  const index = records.findIndex(r => r.id === id);
  if (index < 0 || !records[index].deleted) {
    const error = new Error(`Record ${id} is not in the bin of ${name}`);
    error.code = 'NOT_FOUND';
    throw error;
  }
  const now = nowOf(store);
  const record = change(records[index], now);
  const next = records.slice();
  next[index] = record;
  return store.commit(name, { data: { ...store.data, [name]: next, updatedAt: now }, record });
}

/**
 * Brings a deleted record back under its own id. A deleted document whose
 * number another document of its series got meanwhile stays in the bin:
 * two documents never share a number (TRASH_NUMBER_TAKEN).
 */
export function restoreRecord(store, name, id) {
  if (name === 'documents') {
    const doc = store.get('documents', id, { includeDeleted: true });
    const taken = doc && doc.number && store.list('documents').some(d => d.id !== id && d.seriesId === doc.seriesId && d.number === doc.number);
    if (taken) {
      const error = new Error(`Number ${doc.number} is used by another document`);
      error.code = 'TRASH_NUMBER_TAKEN';
      error.details = { number: doc.number };
      return Promise.reject(error);
    }
  }
  if (typeof store.restore === 'function') return store.restore(name, id);
  return replaceTombstone(store, name, id, (record, now) => restoredRecord(record, now));
}

/** Removes a deleted draft, contact or item for good (a bare tombstone stays for sync). */
export function purgeRecord(store, name, id) {
  if (typeof store.purge === 'function') return store.purge(name, id);
  return replaceTombstone(store, name, id, (record, now) => purgedRecord(name, record, now));
}
