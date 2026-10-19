// A file dropped into the Inbox becomes a received document waiting for
// review: the file is read (XML, QR codes, PDF text, OCR), recognised by
// the core, completed with an online eKasa receipt and the supplier's
// template, saved as a TO_PROCESS document, and the original kept on the
// device. Dependencies come in as parameters so the flow is testable.
import {
  recognizeFound, recognizeEkasaReceipt, mergeRecognitions, draftFromRecognition, findSupplierContact,
  applyTemplateRegions, uuidv7, CoreError
} from '@we-invoice/core';
import { textInRegion } from '../../ocr/text-layout.js';
import { putFile } from './file-store.js';
import { fetchEkasaReceipt } from './ekasa.js';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;

// What was read from the files of this session, by document id: the
// pages drawn for the preview are not stored anywhere else.
const recent = new Map();

export function recentRead(docId) {
  return recent.get(docId) || null;
}

async function defaultReader(file, options) {
  const { readInboxFile } = await import('../../ocr/read-file.js');
  return readInboxFile(file, options);
}

async function withReceipt(recognition, transport, warnings) {
  const receipt = recognition.receipt;
  if (!receipt || receipt.kind !== 'ONLINE' || !transport) return recognition;
  try {
    return mergeRecognitions(recognizeEkasaReceipt(await fetchEkasaReceipt(transport, receipt.receiptId)), recognition);
  } catch (e) {
    console.warn('eKasa receipt could not be fetched', e);
    warnings.push(e.code || 'UPSTREAM_UNAVAILABLE');
    return recognition;
  }
}

/**
 * @param {{name: string, type: string, size: number, arrayBuffer: () => Promise<ArrayBuffer>}} file
 * @param {{store: object, transport?: object, today: string, lineName?: string,
 *   readFile?: Function, onProgress?: Function}} deps
 * @returns {Promise<{doc: object, warnings: string[]}>}
 */
export async function intakeFile(file, deps) {
  const { store, transport = null, today, lineName = '', readFile = defaultReader, onProgress = () => {} } = deps;
  if (file.size > MAX_FILE_BYTES) throw new CoreError('INBOX_FILE_TOO_LARGE', `${file.name} has ${file.size} bytes`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const read = await readFile({ name: file.name, type: file.type, bytes }, { onProgress });
  const company = store.company();
  const warnings = [];
  let recognition = await withReceipt(recognizeFound(read.found, { company, today }), transport, warnings);
  const contact = findSupplierContact(store.list('contacts'), recognition.fields);
  const template = contact ? contact.purchaseTemplate || null : null;
  if (template && template.regions && read.pages && read.pages.length) {
    recognition = applyTemplateRegions(recognition, template, (region) => textInRegion(read.pages[(region.page || 1) - 1] || [], region));
  }
  const fileId = uuidv7();
  const draft = draftFromRecognition(recognition, {
    company, today, contact, template, lineName, file: { id: fileId, name: file.name, mime: file.type || 'application/octet-stream', size: file.size }
  });
  draft.inbox.warnings = [...recognition.warnings.filter(w => typeof w === 'string').slice(0, 10), ...warnings];
  await putFile(fileId, { name: file.name, type: file.type, bytes, pages: read.pages || [] });
  const doc = await store.insert('documents', draft);
  recent.set(doc.id, read);
  return { doc, warnings };
}
