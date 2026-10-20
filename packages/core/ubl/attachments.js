// Files embedded in an e-invoice (BT-125, cac:AdditionalDocumentReference):
// which ones Peppol BIS 3 accepts (its MIME code list, kept in
// sk-rules.json), the MIME type of a file whose type the browser did not
// tell, unique ids for the references and the size of the whole message.
import skRules from './sk-rules.json' with { type: 'json' };

export const EMBEDDABLE_MIME_TYPES = Object.freeze([...skRules.attachments.mimeTypes]);
export const DEFAULT_MAX_MESSAGE_BYTES = skRules.attachments.maxMessageBytes;

const ALLOWED = new Set(EMBEDDABLE_MIME_TYPES);
const BY_EXTENSION = Object.freeze({
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', csv: 'text/csv',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ods: 'application/vnd.oasis.opendocument.spreadsheet'
});
const ALIASES = Object.freeze({ 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'application/csv': 'text/csv' });
const GENERIC = new Set(['', 'application/octet-stream', 'binary/octet-stream']);

/** MIME type of an attachment: the declared one, or the one of its file extension when nothing useful was declared. */
export function attachmentMime(name, mime) {
  const declared = String(mime || '').toLowerCase().split(';')[0].trim();
  const normal = ALIASES[declared] || declared;
  if (!GENERIC.has(normal)) return normal;
  const ext = (/\.([a-z0-9]{1,8})$/i.exec(String(name || '')) || [])[1];
  return (ext && BY_EXTENSION[ext.toLowerCase()]) || 'application/octet-stream';
}

export function isEmbeddableMime(mime) {
  return ALLOWED.has(mime);
}

/**
 * Splits the attachments of a document into those Peppol accepts and those left out.
 * @param {Array<{name: string, mime?: string}>} list
 * @returns {{embeddable: object[], skipped: object[]}}  embeddable entries get the resolved mime
 */
export function splitAttachments(list) {
  const embeddable = [];
  const skipped = [];
  for (const item of list || []) {
    const mime = attachmentMime(item.name, item.mime);
    if (ALLOWED.has(mime)) embeddable.push({ ...item, mime });
    else skipped.push(item);
  }
  return { embeddable, skipped };
}

/** Ids for the references: the document PDF keeps the document number, files get number-1, number-2... never repeated. */
export function attachmentIds(number, count, taken = []) {
  const used = new Set(taken.map(String));
  const ids = [];
  let n = 1;
  while (ids.length < count) {
    const id = `${number || 'ATT'}-${n++}`;
    if (!used.has(id)) {
      used.add(id);
      ids.push(id);
    }
  }
  return ids;
}

/** Size of the XML message in bytes (UTF-8). */
export function messageBytes(xml) {
  return new TextEncoder().encode(xml).length;
}

/** Decoded size of base64 content. */
export function base64Bytes(b64) {
  const text = String(b64 || '').replace(/\s/g, '');
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor(text.length * 3 / 4) - padding);
}
