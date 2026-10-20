// Which attachment files must stay in Google Drive, as pure functions over
// the company data. Invoices and the documents behind them are archived
// for the period of § 76 zákona o DPH (legislation "archiveYears"), so:
//   1. a draft, and an Inbox record that has not become a document yet
//      (TO_PROCESS, not an eFaktura), keeps nothing once its attachment is
//      removed or the Inbox record is deleted;
//   2. an issued (not DRAFT) or received document keeps the files of the
//      attachments removed from it, listed in removedAttachments: hidden
//      from the screens, still synced;
//   3. a document in the recycle bin (a tombstone that can be restored)
//      keeps all its files; they may go only when it is removed for good
//      (purgedAt), and then only when it was a draft or its archive period
//      is over.
// keptAttachments() answers the files to keep, each with the last day it
// must be kept (null: no archive period, it may go once nothing lists it).
// The sync records that day per file, so a file of an archived document
// that vanishes from the data is still kept until then.
import { getLegislation } from '@we-invoice/core';

export const REMOVED_REASON = 'REMOVED_BY_USER';
// When the period cannot be read from the legislation: keep for good.
export const KEEP_FOREVER = '9999-12-31';

/** True when the document's files belong to the accounting archive. */
export function archivesFiles(doc) {
  if (!doc || doc.status === 'DRAFT') return false;
  if (doc.status === 'TO_PROCESS') return Boolean(doc.peppol && doc.peppol.direction === 'IN');
  return true;
}

/** Archive period in years valid on a date (legislation archiveYears). */
export function archiveYearsOn(date, read = getLegislation) {
  try {
    const value = read('archiveYears.years', date);
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch (e) {
    console.warn('The archive period could not be read; files are kept', e);
    return null;
  }
}

function addYears(date, years) {
  const [y, m, d] = date.split('-');
  const md = m === '02' && d === '29' ? '03-01' : `${m}-${d}`;
  return `${String(Number(y) + years).padStart(4, '0')}-${md}`;
}

/** The last day the files of an archived document must be kept: its issue date plus the archive period. */
export function keepUntil(doc, yearsOn = archiveYearsOn) {
  const base = [doc.issueDate, doc.receivedDate, doc.taxDate, String(doc.createdAt || '').slice(0, 10)]
    .find(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')));
  if (!base) return KEEP_FOREVER;
  const years = yearsOn(base);
  return years ? addYears(base, years) : KEEP_FOREVER;
}

function later(a, b) {
  if (a === undefined) return b;
  if (a === null) return b;
  if (b === null) return a;
  return a > b ? a : b;
}

/**
 * The attachment files to keep in Drive: Map id -> last day to keep
 * ('YYYY-MM-DD') or null. A file listed by several documents gets the
 * latest day.
 */
export function keptAttachments(data, { yearsOn = archiveYearsOn } = {}) {
  const kept = new Map();
  for (const doc of (data && data.documents) || []) {
    if (!doc || doc.purgedAt) continue;
    const archived = archivesFiles(doc);
    if (doc.deleted && !archived && doc.status === 'TO_PROCESS') continue;
    const until = archived ? keepUntil(doc, yearsOn) : null;
    for (const a of [...(doc.attachments || []), ...(doc.removedAttachments || [])]) {
      if (a && a.id) kept.set(a.id, later(kept.get(a.id), until));
    }
  }
  return kept;
}

/** Whether a file known with `until` may leave Drive today ('YYYY-MM-DD', local date). */
export function mayRemove(until, today) {
  return !until || String(today) > String(until);
}

/** The archive entry of an attachment removed from an issued or received document. */
export function removedAttachmentEntry(record, removedAt, reason = REMOVED_REASON) {
  return { id: record.id, name: record.name, mime: record.mime || 'application/octet-stream', size: Number(record.size) || 0, removedAt, reason };
}
