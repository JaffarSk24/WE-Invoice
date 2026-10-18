// eKasa receipts for invoice payments, stage 2 (WP-EKASA, P2). A provider
// adapter implements this interface for a certified SORP or ORP with an API.
// VRP2 is never integrated: § 5 ods. 6 zákona 384/2025 forbids it.
import { NotImplementedError } from '../errors.js';

/**
 * @typedef {object} EkasaProvider
 * @property {(p: {invoiceNumber: string, amount: string, paymentMethod: string, currency: string}) =>
 *   Promise<{receiptId: string, okp: string, pdf?: Blob, qr?: string}>} issueInvoicePayment
 * @property {(receiptId: string) => Promise<{receiptId: string, okp: string}>} cancel
 */

export function ekasaReceiptText(payment, ctx) { throw new NotImplementedError('ekasaReceiptText'); }
