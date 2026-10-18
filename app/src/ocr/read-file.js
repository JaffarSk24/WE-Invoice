// Reads one Inbox file into what the core recognition needs
// (recognizeFound): XML texts, QR codes, the PDF text layer and OCR text,
// plus the positioned text of each page for "Vybrať". The order follows
// 03-features.md § 3.11: embedded XML and QR first, the text layer next,
// OCR only for scans and photos without text.
import { detectInboxFile, CoreError } from '@we-invoice/core';
import { itemsToText } from './text-layout.js';

const MAX_PAGES = 3;
const RENDER_WIDTH = 1700;
const MIN_TEXT = 20;

const utf8 = (bytes) => new TextDecoder('utf-8').decode(bytes);
const looksXml = (name, bytes) => /\.(xml|isdoc)$/i.test(name) || /^\s*</.test(utf8(bytes.slice(0, 64)).replace(/^\ufeff/, ''));

async function ocrPages(canvases, onProgress) {
  const { recognizeCanvas } = await import('./engine.js');
  const texts = [];
  const pages = [];
  for (let i = 0; i < canvases.length; i++) {
    const result = await recognizeCanvas(canvases[i], (p) => onProgress('ocr', (i + p) / canvases.length));
    texts.push(result.text);
    pages.push(result.words.map(w => ({ ...w, page: i + 1 })));
  }
  return { text: texts.join('\n'), pages };
}

async function readPdf(bytes, { onProgress, ocr }) {
  const { openPdf } = await import('./pdf.js');
  const { findQrCodes } = await import('./qr.js');
  const pdf = await openPdf(bytes);
  try {
    const found = { xml: [], qr: [], text: '', ocrText: '' };
    for (const a of await pdf.attachments()) if (looksXml(a.name, a.bytes)) found.xml.push(utf8(a.bytes));
    const count = Math.min(pdf.numPages, MAX_PAGES);
    let pages = [];
    const canvases = [];
    for (let n = 1; n <= count; n++) {
      onProgress('reading', n / count);
      pages.push(await pdf.pageItems(n));
      const canvas = document.createElement('canvas');
      await pdf.renderPage(n, canvas, RENDER_WIDTH);
      canvases.push(canvas);
      found.qr.push(...await findQrCodes(canvas));
    }
    found.text = pages.map(itemsToText).join('\n');
    if (found.text.trim().length < MIN_TEXT && !found.xml.length && ocr) {
      const read = await ocrPages(canvases, onProgress);
      found.ocrText = read.text;
      pages = read.pages;
    }
    return { kind: 'PDF', found, pages, canvases };
  } finally {
    await pdf.destroy();
  }
}

async function readImage(blob, { onProgress, ocr }) {
  const { imageToCanvas } = await import('./image.js');
  const { findQrCodes } = await import('./qr.js');
  onProgress('reading', 0.5);
  const canvas = await imageToCanvas(blob);
  const found = { xml: [], qr: await findQrCodes(canvas), text: '', ocrText: '' };
  let pages = [[]];
  if (ocr) {
    const read = await ocrPages([canvas], onProgress);
    found.ocrText = read.text;
    pages = read.pages;
  }
  return { kind: 'IMAGE', found, pages, canvases: [canvas] };
}

/**
 * @param {{name: string, type: string, bytes: Uint8Array}} file
 * @param {{onProgress?: (stage: string, fraction: number) => void, ocr?: boolean}} [options]
 *   ocr: false skips OCR (a picture with an eKasa QR code needs none)
 * @returns {Promise<{kind: string, found: object, pages: object[][], canvases: HTMLCanvasElement[]}>}
 */
export async function readInboxFile(file, { onProgress = () => {}, ocr = true } = {}) {
  const kind = detectInboxFile({ name: file.name, mime: file.type, head: file.bytes.slice(0, 8) });
  if (kind === 'XML') return { kind, found: { xml: [utf8(file.bytes)], qr: [], text: '', ocrText: '' }, pages: [], canvases: [] };
  if (kind === 'PDF') return readPdf(file.bytes, { onProgress, ocr });
  if (kind === 'IMAGE') return readImage(new Blob([file.bytes], { type: file.type || 'image/*' }), { onProgress, ocr });
  throw new CoreError('INBOX_FORMAT_UNKNOWN', `Unsupported file ${file.name} (${file.type})`);
}
