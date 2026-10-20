// Peppol BIS Billing 3.0 (UBL 2.1) with the Slovak rules (WP-PEPPOL):
// building outgoing e-invoices, reading received ones and the local checks
// before sending. Pure functions: no DOM, no network.
import { CoreError } from '../errors.js';
import { ublModel } from './model.js';
import { writeUbl } from './build.js';
import { validateUblLocal, hasBlockingIssues } from './validate.js';

export { parseUbl } from './parse.js';
export { validateUblLocal, hasBlockingIssues } from './validate.js';
export { EMBEDDABLE_MIME_TYPES, DEFAULT_MAX_MESSAGE_BYTES, attachmentMime, isEmbeddableMime, splitAttachments } from './attachments.js';
export { CUSTOMIZATION_ID as UBL_CUSTOMIZATION_ID, PROFILE_ID as UBL_PROFILE_ID } from './codes.js';

/**
 * UBL XML (Invoice or CreditNote) of a tax document.
 * @param {object} document
 * @param {object} company  the seller (used where the document has no seller snapshot)
 * @param {{contact?: object, preceding?: Array<{number: string, issueDate?: string}>,
 *   pdf?: {base64: string, name?: string}, attachPdf?: boolean, maxAttachmentBytes?: number, note?: string}} [options]
 *   preceding: the invoices a credit or debit note corrects (BT-25, BT-26);
 *   attachPdf: overrides company.defaults.attachPdfToEInvoice (on by default)
 * @returns {string}
 * @throws {CoreError} UBL_INVALID with details.issues when a blocking rule fails
 */
export function buildUbl(document, company = {}, options = {}) {
  const issues = validateUblLocal(document, company, options);
  if (hasBlockingIssues(issues)) {
    const codes = issues.filter(i => i.severity === 'error').map(i => i.code);
    throw new CoreError('UBL_INVALID', `document cannot be sent: ${codes.join(', ')}`, { issues });
  }
  return writeUbl(ublModel(document, company, options));
}
