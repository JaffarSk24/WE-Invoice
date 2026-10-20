// Attachments of a sales document (03-features.md § 3.6.2): any number of
// files, at most 10 MB each. The file itself is kept on the device in the
// same store as the original files of the Inbox (purchase/file-store.js);
// the document holds its id, name, type and size (schema attachments), so
// the data file stays small. Adding is allowed on any document; removing
// one from an issued document needs a confirmation (the screen asks) and
// leaves an entry in the change log with the file name. The file of an
// attachment removed from an issued or received document stays in the
// archive (removedAttachments, sync/attachments/retention.js): the screens
// no longer show it, its file stays in Google Drive. Only a draft's file
// is dropped.
import { uuidv7, CoreError } from '@we-invoice/core';
import { putFile, getFile, deleteFile } from '../purchase/file-store.js';
import { audit } from './actions.js';
import { archivesFiles, removedAttachmentEntry } from '../../sync/attachments/retention.js';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const NAME_MAX = 500;

/** Error code of a file that may not be attached, or null. */
export function attachmentError(file) {
  if (!file || !file.name) return 'ATTACHMENT_INVALID';
  if (!Number.isFinite(file.size) || file.size <= 0) return 'ATTACHMENT_EMPTY';
  if (file.size > MAX_ATTACHMENT_BYTES) return 'ATTACHMENT_TOO_LARGE';
  return null;
}

/** The attachment record the document keeps (schema Document.attachments). */
export function attachmentRecord(file, id = uuidv7()) {
  return { id, name: String(file.name).slice(0, NAME_MAX), mime: file.type || 'application/octet-stream', size: file.size };
}

/** Whether removing an attachment must be confirmed and logged: any document that is no longer a draft. */
export function removalNeedsConfirmation(doc) {
  return Boolean(doc && doc.status && doc.status !== 'DRAFT');
}

/**
 * Stores the files and returns their records; files over the limit are
 * refused with ATTACHMENT_TOO_LARGE before anything is written.
 * @param {Array<{name: string, type: string, size: number, arrayBuffer: Function}>} files
 * @param {{put?: Function}} [deps]
 */
export async function storeAttachmentFiles(files, { put = putFile } = {}) {
  const list = Array.from(files || []);
  const bad = list.find(f => attachmentError(f));
  if (bad) throw new CoreError(attachmentError(bad), `${bad.name} cannot be attached`, { name: bad.name });
  const records = [];
  for (const file of list) {
    const record = attachmentRecord(file);
    await put(record.id, { name: record.name, type: record.mime, bytes: new Uint8Array(await file.arrayBuffer()) });
    records.push(record);
  }
  return records;
}

/** Adds stored files to a document in the store. */
export async function addAttachments(store, docId, files, deps) {
  const records = await storeAttachmentFiles(files, deps);
  const doc = store.get('documents', docId);
  await store.update('documents', docId, { attachments: [...(doc.attachments || []), ...records] });
  return records;
}

/**
 * Removes an attachment from a document in the store. A draft's file is
 * dropped; an issued or received document keeps it in its archive of
 * removed attachments. An issued document gets a change log entry naming
 * the file.
 */
export async function removeAttachment(store, docId, attachmentId, { remove = deleteFile, now = () => new Date().toISOString() } = {}) {
  const doc = store.get('documents', docId);
  const record = (doc.attachments || []).find(a => a.id === attachmentId);
  if (!record) return null;
  const patch = { attachments: (doc.attachments || []).filter(a => a.id !== attachmentId) };
  const archived = archivesFiles(doc);
  if (archived) patch.removedAttachments = [...(doc.removedAttachments || []), removedAttachmentEntry(record, now())];
  await store.update('documents', docId, patch);
  if (removalNeedsConfirmation(doc)) {
    await audit(store, 'UPDATE', docId, { changes: [{ field: 'attachments', from: record.name, to: null }], reason: 'attachment removed' });
  }
  if (archived) return record;
  // A file another document still lists (a copy made elsewhere) stays.
  const shared = store.list('documents').some(d => d.id !== docId && (d.attachments || []).some(a => a.id === attachmentId));
  if (shared) return record;
  try {
    await remove(attachmentId);
  } catch (e) {
    console.warn(`File of attachment ${attachmentId} could not be removed from the device`, e);
  }
  return record;
}

/** The file of an attachment as a Blob, or null when this device does not have it. */
export async function attachmentBlob(record, { get = getFile } = {}) {
  const file = await get(record.id);
  if (!file || !file.bytes) return null;
  return new Blob([file.bytes], { type: record.mime || file.type || 'application/octet-stream' });
}
