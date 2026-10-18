// Inbox recognition of received invoices and receipts (WP-PURCHASE):
// fields from PDF text with checksum-verified identifiers.
import { NotImplementedError } from '../../errors.js';

/** @returns {{fields: object, sources: object, confidence: number}} */
export function extractInvoiceFields(text, ctx) { throw new NotImplementedError('extractInvoiceFields'); }
/** Parses the content of an eKasa receipt QR code. @returns {{receiptId: string}|null} */
export function parseEkasaQr(text) { throw new NotImplementedError('parseEkasaQr'); }
