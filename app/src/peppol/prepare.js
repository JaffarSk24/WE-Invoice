// Everything the send queue needs before it talks to a provider: the
// contact, the invoices a credit note corrects (BT-25), the amount already
// paid on a tax document to a payment, the PDF and the user's attachments
// to embed (BT-125), the local checks and finally the UBL XML. No network
// here except building the PDF. Attachments of a type Peppol does not
// accept are left out and reported; a file that is not on this device
// stops the sending with the names of the missing files.
import {
  buildUbl, validateUblLocal, hasBlockingIssues, computeTotals, peppolRequirement, splitAttachments, DEFAULT_MAX_MESSAGE_BYTES
} from '@we-invoice/core';
import { PeppolError } from './errors.js';

const ROOT_OF = { CREDIT_NOTE: 'CreditNote' };

function preceding(store, document) {
  return (document.links || []).filter(l => l.kind === 'CORRECTS')
    .map(l => store.get('documents', l.docId))
    .filter(Boolean)
    .map(d => ({ number: d.number, issueDate: d.issueDate }));
}

/** Options for buildUbl that depend on the data around the document. */
export function ublOptions(store, document, company) {
  const contact = document.contactId ? store.get('contacts', document.contactId) : null;
  const options = { contact, preceding: preceding(store, document) };
  // A tax document to a received payment is paid by definition (§ 71 ods. 1 písm. b).
  if (document.kind === 'ADVANCE_TAX_DOC') options.prepaid = computeTotals(document).gross;
  if (company?.defaults?.roundingCash && document.paymentMethod === 'CASH') options.cashRounding = true;
  return options;
}

/** Whether the document may go through Peppol at all (§ 4.5). */
export function assertSendable(document, company, contact) {
  const { requirement } = peppolRequirement(company, contact, document);
  if (requirement === 'NOT_ALLOWED' || requirement === 'NOT_APPLICABLE') {
    throw new PeppolError('PEPPOL_NOT_ALLOWED', `requirement ${requirement}`, { detail: requirement });
  }
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return globalThis.btoa(binary);
}

async function blobToBase64(blob) {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
}

async function fileBytes(file) {
  if (!file) return null;
  if (file.bytes instanceof Uint8Array) return file.bytes;
  if (file.bytes instanceof ArrayBuffer) return new Uint8Array(file.bytes);
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer());
  return null;
}

/**
 * The document's own files to embed: those Peppol accepts, read from the
 * device. Throws PEPPOL_ATTACHMENT_MISSING with the names of files that are
 * not here (added on another device, or removed from this one).
 * @param {object} document
 * @param {(id: string) => Promise<{bytes: Uint8Array}|null>} [loadAttachment]
 * @returns {Promise<{files: object[], skipped: string[]}>}
 */
export async function attachmentFiles(document, loadAttachment) {
  const { embeddable, skipped } = splitAttachments(document.attachments || []);
  const files = [];
  const missing = [];
  for (const a of embeddable) {
    let bytes = null;
    try {
      bytes = loadAttachment ? await fileBytes(await loadAttachment(a.id)) : null;
    } catch (error) {
      console.warn('peppol: attachment file not readable', a.id, error.name || error.code);
    }
    if (!bytes || !bytes.length) missing.push(a.name);
    else files.push({ name: a.name, mime: a.mime, base64: bytesToBase64(bytes) });
  }
  if (missing.length) throw new PeppolError('PEPPOL_ATTACHMENT_MISSING', `${missing.length} attachment files are not on this device`, { detail: missing.join(', ') });
  return { files, skipped: skipped.map(a => a.name) };
}

/**
 * @param {{store: object, document: object, company: object, buildPdf?: Function, pdfName?: Function,
 *   maxAttachmentBytes?: number|null, maxMessageBytes?: number|null, loadAttachment?: Function}} input
 *   maxMessageBytes: the provider's limit for the whole message, 10 MB when it states none
 * @returns {Promise<{xml: string|null, rootName: string, issues: object[], options: object, pdfAttached: boolean, skippedAttachments: string[]}>}
 */
export async function prepareUbl({ store, document, company, buildPdf = null, pdfName = null, maxAttachmentBytes = null, maxMessageBytes = null, loadAttachment = null }) {
  const options = ublOptions(store, document, company);
  assertSendable(document, company, options.contact);
  const attach = company?.defaults?.attachPdfToEInvoice !== false;
  if (attach && buildPdf) {
    try {
      const blob = await buildPdf(document, company);
      options.pdf = { base64: await blobToBase64(blob), name: pdfName ? pdfName(document, company) : `${document.number}.pdf` };
      if (maxAttachmentBytes) options.maxAttachmentBytes = maxAttachmentBytes;
    } catch (error) {
      // The PDF is optional in an e-invoice (BT-125): send without it rather than not at all.
      console.warn('peppol: PDF for the e-invoice could not be built', error.code || error.name);
    }
  }
  const { files, skipped } = await attachmentFiles(document, loadAttachment);
  options.attachments = files;
  options.maxMessageBytes = maxMessageBytes || DEFAULT_MAX_MESSAGE_BYTES;
  const issues = validateUblLocal(document, company, options);
  const rootName = ROOT_OF[document.kind] || 'Invoice';
  if (hasBlockingIssues(issues)) return { xml: null, rootName, issues, options, pdfAttached: false, skippedAttachments: skipped };
  return { xml: buildUbl(document, company, options), rootName, issues, options, pdfAttached: Boolean(options.pdf), skippedAttachments: skipped };
}

/** Peppol id of the receiver as written into the UBL (0245:DIČ or the buyer's own id). */
export function receiverIdOf(document, contact) {
  const explicit = document.buyer?.peppolId || contact?.peppolId;
  if (explicit && /^[0-9]{4}:.+/.test(explicit)) return explicit;
  const dic = String(document.buyer?.dic || contact?.dic || '').replace(/\D/g, '');
  return dic.length === 10 ? `0245:${dic}` : null;
}
