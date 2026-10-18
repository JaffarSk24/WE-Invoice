// Document lifecycle, statuses, conversions and legal checks (WP-CORE).
import { NotImplementedError } from '../errors.js';

/** UNCL1001 type code for UBL, or null for non-tax documents. @returns {string|null} */
export function ublTypeCode(kind) { throw new NotImplementedError('ublTypeCode'); }

/** Statuses a kind may take. @returns {string[]} */
export function allowedStatuses(kind) { throw new NotImplementedError('allowedStatuses'); }

/** Status shown today (overdue, partially paid...). @returns {string} */
export function documentStatus(document, today) { throw new NotImplementedError('documentStatus'); }

/** False for locked or Peppol-sent documents. @returns {{editable: boolean, reason?: string}} */
export function canEdit(document) { throw new NotImplementedError('canEdit'); }

/**
 * New draft of another kind from a document (quote to invoice, invoice to
 * credit note...), with links set.
 * @returns {import('../schema/types.js').Document}
 */
export function convertDocument(document, targetKind, ctx) { throw new NotImplementedError('convertDocument'); }

/**
 * Mandatory particulars of § 74 ods. 1 zákona o DPH (03-features.md § 3.6.1).
 * @returns {Array<{field: string, code: string}>} empty when the document may be issued
 */
export function missingParticulars(document, company, date) { throw new NotImplementedError('missingParticulars'); }

/** Assigns number and party snapshots; returns the issued document. */
export function issueDocument(document, ctx) { throw new NotImplementedError('issueDocument'); }
