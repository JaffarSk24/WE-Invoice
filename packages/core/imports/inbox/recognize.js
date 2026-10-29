// The recognition order of the Inbox (03-features.md § 3.11): structured
// data first (an XML e-invoice, also one embedded in a PDF; QR codes),
// then the text layer of a PDF, then OCR of a scan or photo. The readers
// of files (PDF text, QR in pictures, OCR) live in the app; this module
// only combines what they found.
import { recognizeXml, detectXmlFormat } from './recognize-xml.js';
import { recognizeQr } from './recognize-qr.js';
import { extractInvoiceFields } from './text-fields.js';
import { mergeRecognitions, emptyRecognition, finish } from './result.js';
import { cleanText, fold } from './text-scan.js';

/** 'XML' | 'PDF' | 'IMAGE' | null from a file name, a MIME type and its first bytes. */
export function detectInboxFile({ name = '', mime = '', head = null } = {}) {
  const bytes = head ? Array.from(head.slice(0, 8)) : [];
  const starts = (...sig) => sig.every((b, i) => bytes[i] === b);
  if (starts(0x25, 0x50, 0x44, 0x46) || /pdf/i.test(mime) || /\.pdf$/i.test(name)) return 'PDF';
  if (starts(0x89, 0x50, 0x4e, 0x47) || starts(0xff, 0xd8, 0xff) || /^image\//i.test(mime) || /\.(png|jpe?g|webp|heic|bmp|gif)$/i.test(name)) return 'IMAGE';
  if (/xml/i.test(mime) || /\.(xml|isdoc)$/i.test(name) || starts(0x3c) || starts(0xef, 0xbb, 0xbf, 0x3c)) return 'XML';
  return null;
}

/**
 * Combines what was read from one file.
 * @param {{xml?: string[], qr?: string[], text?: string, ocrText?: string}} found
 *   xml: XML texts (the file itself or attachments of a PDF); qr: decoded
 *   QR texts; text: the PDF text layer; ocrText: OCR of the pages.
 * @param {{company?: object, today?: string}} ctx
 */
export function recognizeFound(found, ctx = {}) {
  const parts = [];
  const warnings = [];
  for (const xml of found.xml || []) {
    if (!detectXmlFormat(xml)) continue;
    try {
      parts.push(recognizeXml(xml, ctx));
      break;
    } catch (e) {
      warnings.push(`XML_UNREADABLE: ${e.message}`);
    }
  }
  for (const qr of found.qr || []) {
    try {
      const r = recognizeQr(qr);
      if (r) parts.push(r);
    } catch (e) {
      warnings.push(`QR_UNREADABLE: ${e.message}`);
    }
  }
  if (found.text && found.text.trim().length > 20) parts.push(extractInvoiceFields(found.text, { ...ctx, source: 'text' }));
  else if (found.ocrText && found.ocrText.trim()) parts.push(extractInvoiceFields(found.ocrText, { ...ctx, source: 'ocr' }));
  if (!parts.length) return { ...finish(emptyRecognition('NONE')), warnings };
  const merged = mergeRecognitions(...parts);
  merged.warnings.push(...warnings);
  confirmNameByText(merged, found.text || found.ocrText);
  // Without XML a person checks the fields (§ 3.11 AC); a QR alone carries no supplier.
  if (!parts.some(p => ['UBL', 'ISDOC', 'CII'].includes(p.format))) merged.needsConfirmation = true;
  return merged;
}

// Letters and digits only, folded: "O2 Slovakia, s.r.o." -> "o2slovakiasro".
const squash = (text) => fold(cleanText(text)).replace(/[^a-z0-9]/g, '');

// The name in a payment QR code is unsure on its own (banking apps strip
// diacritics, some put a brand there). Printed in the document as well,
// it is the supplier's name.
function confirmNameByText(result, text) {
  const name = result.fields.supplierName;
  if (!name || !text || result.sources.supplierName !== 'qr') return;
  const key = squash(name);
  if (key.length >= 4 && squash(text).includes(key)) result.fieldConfidence.supplierName = 0.9;
}
