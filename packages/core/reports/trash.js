// The recycle bin (kôš). A deleted record stays in the data as a tombstone
// (deleted: true), so the deletion syncs to the other devices; the bin
// lists the tombstones a person may still want back:
//   - drafts, contacts and price list items can be restored for 30 days
//     and can be removed for good before that;
//   - an issued or received document is part of the accounting archive
//     (zákon o účtovníctve, ten years): it can be restored at any time and
//     is never removed for good.
// Removing for good keeps a bare tombstone (id, dates, deleted, purgedAt
// and the fields the schema requires, emptied) so the deletion still
// syncs; names, addresses and lines are gone.
import { CoreError } from '../errors.js';
import { SCHEMAS, COLLECTION_SCHEMA } from '../schema/index.js';

// How long a deleted draft or contact stays in the bin: a product rule
// (03-features.md § 3.16), not a legal period.
export const TRASH_RETENTION_DAYS = 30;
export const TRASH_COLLECTIONS = Object.freeze(['documents', 'contacts', 'items', 'recurringTemplates']);
const DAY_MS = 86400000;

/** True for a document that was issued or received and so belongs to the archive. */
export function isArchived(collection, record) {
  if (collection !== 'documents') return false;
  return Boolean(record.number) || (record.status && record.status !== 'DRAFT');
}

function titleOf(collection, record) {
  if (collection === 'documents') {
    const party = (record.kind || '').startsWith('RECEIVED') || record.kind === 'EXPENSE_RECEIPT' ? record.seller : record.buyer;
    return { title: record.number || '', subtitle: (party && party.name) || record.contactName || '' };
  }
  if (collection === 'items') return { title: record.name || '', subtitle: record.code || '' };
  return { title: record.name || '', subtitle: record.ico || '' };
}

/**
 * What the bin shows: tombstones not yet removed for good, newest first.
 * @param {Record<string, object[]>} data  collections with deleted records included
 * @param {{now: string, retentionDays?: number}} ctx  now as an ISO instant (UTC)
 */
export function trashEntries(data, ctx) {
  const { now, retentionDays = TRASH_RETENTION_DAYS } = ctx || {};
  if (!now) throw new CoreError('DATE_INVALID', 'trashEntries needs the current instant');
  const nowMs = Date.parse(now);
  const entries = [];
  for (const collection of TRASH_COLLECTIONS) {
    for (const record of (data && data[collection]) || []) {
      if (!record || !record.deleted || record.purgedAt) continue;
      const archived = isArchived(collection, record);
      const deletedAt = record.updatedAt;
      const expiresAt = archived ? null : new Date(Date.parse(deletedAt) + retentionDays * DAY_MS).toISOString();
      if (expiresAt && Date.parse(expiresAt) <= nowMs) continue;
      entries.push({
        collection, id: record.id, kind: record.kind || null, status: record.status || null, ...titleOf(collection, record),
        deletedAt, expiresAt, archived, canRestore: true, canPurge: !archived
      });
    }
  }
  return entries.sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}

/** The record brought back: live again with a new change time. */
export function restoredRecord(record, now) {
  if (!record || !record.deleted) throw new CoreError('TRASH_NOT_DELETED', 'the record is not in the bin');
  return { ...record, deleted: false, updatedAt: now };
}

/** The bare tombstone left after removing a record for good. */
export function purgedRecord(collection, record, now) {
  if (!record || !record.deleted) throw new CoreError('TRASH_NOT_DELETED', 'the record is not in the bin');
  if (isArchived(collection, record)) throw new CoreError('TRASH_ARCHIVED', 'an issued document stays in the archive');
  const bare = { id: record.id, createdAt: record.createdAt, updatedAt: now, deleted: true, purgedAt: now };
  const schema = SCHEMAS[COLLECTION_SCHEMA[collection]];
  for (const field of (schema && schema.required) || []) {
    if (field in bare) continue;
    const value = record[field];
    if (Array.isArray(value)) bare[field] = [];
    else if (field === 'name' || field === 'docTemplate') bare[field] = field === 'name' ? '' : {};
    else bare[field] = value;
  }
  return bare;
}
