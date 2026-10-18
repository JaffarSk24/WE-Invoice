// QR payment codes: PAY by square (SK) and QR Platba / SPD (CZ), WP-PDF.
import { NotImplementedError } from '../errors.js';

/**
 * @param {{iban: string, bic?: string, amount: string, currency: string, vs?: string, ks?: string,
 *   ss?: string, dueDate?: string, note?: string, beneficiary?: string}} payment
 * @returns {string} the encoded string to put into a QR code
 */
export function payBySquare(payment) { throw new NotImplementedError('payBySquare'); }
/** @returns {object} decoded payment (for the roundtrip test and the Inbox) */
export function decodePayBySquare(text) { throw new NotImplementedError('decodePayBySquare'); }
/** @returns {string} SPD string for QR Platba */
export function qrPlatba(payment) { throw new NotImplementedError('qrPlatba'); }
