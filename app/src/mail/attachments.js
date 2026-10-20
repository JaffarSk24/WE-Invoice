// The files attached to a document (Document.attachments) as e-mail
// attachments, read from the device store where the editor keeps them
// (views/purchase/file-store.js). A file this device does not have is
// listed as missing, so the window can say so before sending.
import { getFile } from '../views/purchase/file-store.js';

/**
 * @param {object} document
 * @param {{get?: Function}} [deps]
 * @returns {Promise<{files: Array<{fileName: string, blob: Uint8Array, contentType: string}>, missing: string[]}>}
 */
export async function documentAttachments(document, { get = getFile } = {}) {
  const files = [];
  const missing = [];
  for (const record of (document && document.attachments) || []) {
    let file = null;
    try {
      file = await get(record.id);
    } catch (e) {
      console.warn(`Attachment ${record.id} could not be read`, e);
    }
    if (file && file.bytes) files.push({ fileName: record.name, blob: file.bytes, contentType: record.mime || file.type || 'application/octet-stream' });
    else missing.push(record.name);
  }
  return { files, missing };
}
