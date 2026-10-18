// Writing many records at once (an import, a restore, marking a period
// exported). The store's CRUD methods save the whole file per record,
// which is slow for thousands; here the new data root is computed by the
// core and handed to the store in one step. The store announces it as a
// sync arrival (lists redraw); a second announcement as a local change
// makes the sync engine upload it like any other edit.
import { auditEntryFor, AUDITED_COLLECTIONS, uuidv7 } from '@we-invoice/core';
import { StoreError, CODES } from '../../store/index.js';

/**
 * The change log of a bulk write: one entry per audited record that the
 * new root adds, changes or deletes, with the reason (import, restore).
 * The running change log recorder sees a bulk write as a sync and does
 * not log it, so it is logged here.
 */
export function withAudit(before, after, { now, reason }) {
  const entries = [];
  Object.keys(AUDITED_COLLECTIONS).forEach(name => {
    const old = new Map(((before && before[name]) || []).map(r => [r.id, r]));
    (after[name] || []).forEach(record => {
      const previous = old.get(record.id) || null;
      if (previous === record) return;
      const fields = auditEntryFor({ collection: name, before: previous, after: record, at: now });
      if (fields) entries.push({ ...fields, reason, id: uuidv7(), createdAt: now, updatedAt: now, deleted: false });
    });
  });
  return entries.length ? { ...after, auditLog: [...(after.auditLog || []), ...entries] } : after;
}

export async function replaceCompanyData(store, data) {
  if (!store || !store.data) throw new StoreError(CODES.NO_COMPANY, 'No company is open');
  if (store.readOnly) throw new StoreError(CODES.READ_ONLY, 'The data is open read-only');
  if (data.companyId !== store.data.companyId) throw new StoreError(CODES.NO_COMPANY, 'The data is for another company');
  await store.applySynced(data);
  store.emit('data:changed', { collection: null, id: null, source: 'local' });
  return store.data;
}
