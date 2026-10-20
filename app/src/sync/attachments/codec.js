// What an attachment file in Drive holds, and how its name is read. Pure
// functions over bytes.
//
//   <companyId>/attachments/<attachmentId>.enc
//
// The name carries only the attachment id: the original file name, its
// extension and its type stay inside the encrypted content. The content
// (sealed by remote.putSealed: magic, AES-GCM, gzip) is
//
//   "WEA1" | header length (4 bytes, big endian) | header JSON | file bytes
//
// with the header { v, name, type, pages }: the file name and type, and
// the positioned text of its pages from the Inbox reading, so another
// device shows the preview and "Vybrat" without reading the file again.
// Files written by the eFaktura inbox before this format
// (<attachmentId>.<ext>.enc) hold only the file bytes; they are read too.
import { cryptoError, concat } from '../crypto.js';

export const PAYLOAD_MAGIC = new Uint8Array([0x57, 0x45, 0x41, 0x31]); // "WEA1"
export const PAYLOAD_VERSION = 1;
const ID = /^[0-9A-Za-z_-]{1,64}$/;
const utf8 = new TextEncoder();
const utf8d = new TextDecoder();

const MIME_BY_EXT = Object.freeze({
  pdf: 'application/pdf', xml: 'application/xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', txt: 'text/plain', csv: 'text/csv'
});

/** The file name in the attachments folder for an attachment id. */
export function attachmentFileName(id) {
  if (!ID.test(String(id || ''))) throw cryptoError('DAMAGED', `Not an attachment id: ${id}`);
  return `${id}.enc`;
}

/**
 * Reads a name of the attachments folder: { id, ext } for "<id>.enc" and
 * for the older "<id>.<ext>.enc", null for anything else.
 */
export function parseAttachmentName(name) {
  const m = /^([0-9A-Za-z_-]{1,64})(?:\.([0-9A-Za-z]{1,8}))?\.enc$/.exec(String(name || ''));
  return m ? { id: m[1], ext: m[2] ? m[2].toLowerCase() : null } : null;
}

function hasPayloadMagic(bytes) {
  return bytes.length >= 8 && PAYLOAD_MAGIC.every((b, i) => bytes[i] === b);
}

/** The bytes to seal for a file kept by the device store: { name, type, bytes, pages }. */
export function encodePayload(file) {
  const bytes = file && file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file && file.bytes ? file.bytes : []);
  const header = utf8.encode(JSON.stringify({
    v: PAYLOAD_VERSION,
    name: String((file && file.name) || ''),
    type: String((file && file.type) || ''),
    pages: Array.isArray(file && file.pages) ? file.pages : []
  }));
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, header.length, false);
  return concat(PAYLOAD_MAGIC, length, header, bytes);
}

/**
 * The file again from opened bytes. `fallback` ({ name, type, ext }) names
 * a file of the older format, which has no header.
 */
export function decodePayload(bytes, fallback = {}) {
  if (!(bytes instanceof Uint8Array)) throw cryptoError('DAMAGED', 'Attachment content is not bytes');
  if (!hasPayloadMagic(bytes)) {
    return { name: fallback.name || '', type: fallback.type || MIME_BY_EXT[fallback.ext] || '', bytes, pages: [] };
  }
  const length = new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getUint32(0, false);
  if (8 + length > bytes.length) throw cryptoError('DAMAGED', 'Attachment header is cut off');
  let header;
  try {
    header = JSON.parse(utf8d.decode(bytes.subarray(8, 8 + length)));
  } catch (e) {
    throw cryptoError('DAMAGED', 'Attachment header is not JSON');
  }
  if (!header || typeof header !== 'object') throw cryptoError('DAMAGED', 'Attachment header is not an object');
  if (header.v > PAYLOAD_VERSION) throw cryptoError('NEWER_FORMAT', `Attachment format ${header.v}`);
  return {
    name: typeof header.name === 'string' ? header.name : (fallback.name || ''),
    type: typeof header.type === 'string' ? header.type : (fallback.type || ''),
    bytes: bytes.slice(8 + length),
    pages: Array.isArray(header.pages) ? header.pages : []
  };
}

/** Ids of the attachments that live documents list (tombstoned documents list none). */
export function referencedAttachmentIds(data) {
  const ids = new Set();
  ((data && data.documents) || []).forEach(doc => {
    if (!doc || doc.deleted) return;
    (doc.attachments || []).forEach(a => { if (a && a.id) ids.add(a.id); });
  });
  return ids;
}

/** The attachment record (name, mime) of an id in the data, or null. */
export function attachmentRecordOf(data, id) {
  for (const doc of (data && data.documents) || []) {
    const record = (doc.attachments || []).find(a => a && a.id === id);
    if (record) return record;
  }
  return null;
}
