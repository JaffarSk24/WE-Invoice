// The change log (AuditEntry, 03-features.md § 3.16): who changed which
// record, when, and what kind of change it was. The log names the fields
// that changed but keeps their values only for a few plain fields
// (status, number, dates); amounts, texts, addresses and anything secret
// never land in it, because the log is kept longer than the records.
import { localDate } from '../documents/dates.js';
import { fold } from './search.js';

export const AUDITED_COLLECTIONS = Object.freeze({ documents: 'Document', contacts: 'Contact', items: 'Item', recurringTemplates: 'RecurringTemplate' });
const IGNORED = new Set(['id', 'createdAt', 'updatedAt']);
const PLAIN = new Set(['status', 'kind', 'number', 'issueDate', 'taxDate', 'dueDate', 'deliveryDate', 'receivedDate', 'deleted', 'currency', 'language', 'lockedAt', 'exportedAt']);

function same(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The fields that differ between two versions of a record; values only for plain fields. */
export function changedFields(before, after) {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const changes = [];
  for (const field of Array.from(fields).sort()) {
    if (IGNORED.has(field)) continue;
    const from = before ? before[field] : undefined;
    const to = after ? after[field] : undefined;
    if (same(from ?? null, to ?? null)) continue;
    changes.push(PLAIN.has(field) ? { field, from: from ?? null, to: to ?? null } : { field });
  }
  return changes;
}

/** CREATE, DELETE, ISSUE, SEND, LOCK, UNLOCK, EXPORT or UPDATE; null when nothing changed. */
export function auditAction(before, after) {
  const was = before && !before.deleted;
  const is = after && !after.deleted;
  if (!was && is) return before ? 'UPDATE' : 'CREATE';
  if (was && !is) return 'DELETE';
  if (!was && !is) return null;
  if (before.status === 'DRAFT' && after.status && after.status !== 'DRAFT') return 'ISSUE';
  if ((after.sendLog || []).length > (before.sendLog || []).length) return 'SEND';
  if (!before.lockedAt && after.lockedAt) return 'LOCK';
  if (before.lockedAt && !after.lockedAt) return 'UNLOCK';
  if (!before.exportedAt && after.exportedAt) return 'EXPORT';
  return 'UPDATE';
}

/**
 * The fields of a new auditLog record for one change, or null when the
 * change is not worth a line (nothing but the change time moved).
 * @param {{collection: string, before: object|null, after: object|null, at: string, actor?: string|null, device?: string|null}} change
 */
export function auditEntryFor({ collection, before, after, at, actor = null, device = null }) {
  const entity = AUDITED_COLLECTIONS[collection];
  if (!entity || !(after || before)) return null;
  const action = auditAction(before, after);
  if (!action) return null;
  const changes = action === 'CREATE' || action === 'DELETE' ? [] : changedFields(before, after);
  if (action === 'UPDATE' && !changes.length) return null;
  const restored = before && before.deleted && after && !after.deleted;
  return { at, actor, device, action, entity, entityId: (after || before).id, changes, reason: restored ? 'restore' : null };
}

/**
 * Filters log entries: by local calendar dates, action, entity, record and
 * a text found in the actor, device, entity or changed field names.
 * @param {object[]} entries
 * @param {{from?: string, to?: string, action?: string, entity?: string, entityId?: string, text?: string}} filter
 */
export function filterAudit(entries, filter = {}) {
  const text = fold(filter.text || '').trim();
  const days = new Map();
  const dayOf = (at) => {
    if (!days.has(at)) days.set(at, localDate(at));
    return days.get(at);
  };
  return (entries || [])
    .filter(e => e && !e.deleted)
    .filter(e => !filter.action || e.action === filter.action)
    .filter(e => !filter.entity || e.entity === filter.entity)
    .filter(e => !filter.entityId || e.entityId === filter.entityId)
    .filter(e => (!filter.from && !filter.to) || ((!filter.from || dayOf(e.at) >= filter.from) && (!filter.to || dayOf(e.at) <= filter.to)))
    .filter(e => !text || fold([e.actor, e.device, e.entity, e.reason, ...(e.changes || []).map(c => c.field)].filter(Boolean).join(' ')).includes(text))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
