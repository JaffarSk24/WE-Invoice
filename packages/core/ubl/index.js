// Peppol BIS Billing 3.0 (UBL 2.1) with the Slovak rules (WP-PEPPOL).
import { NotImplementedError } from '../errors.js';

/** @returns {string} UBL XML (Invoice or CreditNote) */
export function buildUbl(document, ctx) { throw new NotImplementedError('buildUbl'); }

/** @returns {{document: object, attachments: object[], warnings: string[]}} */
export function parseUbl(xml) { throw new NotImplementedError('parseUbl'); }

/** Local checks before sending (SK rules, required BTs). @returns {Array<{rule: string, field?: string}>} */
export function validateUblLocal(document, ctx) { throw new NotImplementedError('validateUblLocal'); }
