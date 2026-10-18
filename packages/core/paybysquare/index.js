// QR payment codes (WP-PDF): PAY by square for Slovak and Czech accounts
// paid in EUR, QR Platba (SPD) for Czech accounts paid in CZK. Pure
// functions on the app's payment shape (decimal strings, calendar dates);
// the QR picture itself is drawn by the PDF module or the interface.
//
//   payBySquare(payment)        -> encoded text for the QR picture
//   decodePayBySquare(text)     -> payment (also used by the Inbox)
//   qrPlatba(payment)           -> SPD text
//   decodeQrPlatba(text)        -> payment
//   paymentQr(payment)          -> { format, text } or null when no format fits
//   paymentQrFormat(payment)    -> 'PAY_BY_SQUARE' | 'QR_PLATBA' | null
//
// payment = { iban, bic?, amount, currency, vs?, ks?, ss?, dueDate?, note?,
//             beneficiary?, invoiceId? }
import { encodePayBySquare, decodePayBySquareText, normalizeIban } from './pay.js';
import { encodeSpd, decodeSpd } from './spd.js';

export const QR_FORMATS = Object.freeze({ PAY_BY_SQUARE: 'PAY_BY_SQUARE', QR_PLATBA: 'QR_PLATBA' });

export function payBySquare(payment) {
  return encodePayBySquare(payment);
}

export function decodePayBySquare(text) {
  return decodePayBySquareText(text);
}

export function qrPlatba(payment) {
  return encodeSpd(payment);
}

export function decodeQrPlatba(text) {
  return decodeSpd(text);
}

function isZeroAmount(amount) {
  return !/[1-9]/.test(String(amount ?? ''));
}

/**
 * Which QR a payment gets (03-features.md § 3.7): PAY by square for EUR
 * on a SK or CZ IBAN (and for any currency on a SK IBAN, Slovak banks read
 * it), QR Platba for CZK on a CZ IBAN. Nothing for a zero amount or other
 * countries.
 */
export function paymentQrFormat(payment) {
  if (!payment || isZeroAmount(payment.amount)) return null;
  const iban = normalizeIban(payment.iban);
  const country = iban.slice(0, 2);
  const currency = String(payment.currency || 'EUR').toUpperCase();
  if (country === 'CZ' && currency === 'CZK') return QR_FORMATS.QR_PLATBA;
  if (country === 'SK') return QR_FORMATS.PAY_BY_SQUARE;
  if (country === 'CZ' && currency === 'EUR') return QR_FORMATS.PAY_BY_SQUARE;
  return null;
}

/** @returns {{format: string, text: string}|null} */
export function paymentQr(payment) {
  const format = paymentQrFormat(payment);
  if (!format) return null;
  const text = format === QR_FORMATS.QR_PLATBA ? qrPlatba(payment) : payBySquare(payment);
  return { format, text };
}
