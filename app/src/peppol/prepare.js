// Everything the send queue needs before it talks to a provider: the
// contact, the invoices a credit note corrects (BT-25), the amount already
// paid on a tax document to a payment, the PDF to attach, the local checks
// and finally the UBL XML. No network here except building the PDF.
import { buildUbl, validateUblLocal, hasBlockingIssues, computeTotals, peppolRequirement } from '@we-invoice/core';
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

async function blobToBase64(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return globalThis.btoa(binary);
}

/**
 * @param {{store: object, document: object, company: object, buildPdf?: Function, pdfName?: Function, maxAttachmentBytes?: number|null}} input
 * @returns {Promise<{xml: string|null, rootName: string, issues: object[], options: object, pdfAttached: boolean}>}
 */
export async function prepareUbl({ store, document, company, buildPdf = null, pdfName = null, maxAttachmentBytes = null }) {
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
  const issues = validateUblLocal(document, company, options);
  const rootName = ROOT_OF[document.kind] || 'Invoice';
  if (hasBlockingIssues(issues)) return { xml: null, rootName, issues, options, pdfAttached: false };
  return { xml: buildUbl(document, company, options), rootName, issues, options, pdfAttached: Boolean(options.pdf) };
}

/** Peppol id of the receiver as written into the UBL (0245:DIČ or the buyer's own id). */
export function receiverIdOf(document, contact) {
  const explicit = document.buyer?.peppolId || contact?.peppolId;
  if (explicit && /^[0-9]{4}:.+/.test(explicit)) return explicit;
  const dic = String(document.buyer?.dic || contact?.dic || '').replace(/\D/g, '');
  return dic.length === 10 ? `0245:${dic}` : null;
}
