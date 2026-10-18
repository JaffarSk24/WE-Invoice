// PAY by square (the Slovak banking QR standard, SBA specification 1.2.0):
// the payload is tab separated fields, CRC32 checksummed, LZMA compressed
// and base32hex encoded. The bysquare library (Apache-2.0) does the
// container work; this module maps the app's decimal-string payment onto
// the library's model and back, so the rest of the core never sees floats.
//
// The library takes the amount as a number. A decimal string with at most
// two places and fewer than 16 significant digits survives the conversion
// unchanged (no arithmetic happens, only formatting); anything else is
// refused here rather than silently rounded.
import { encode, decode, PaymentOptions } from 'bysquare/pay';
import { CoreError } from '../errors.js';

const AMOUNT = /^\d{1,13}(\.\d{1,2})?$/;
const SYMBOL = /^\d{1,10}$/;
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function amountToNumber(amount) {
  const text = String(amount ?? '').trim();
  if (!AMOUNT.test(text)) throw new CoreError('QR_INVALID_AMOUNT', `Amount "${text}" is not a positive decimal with up to two places`);
  const number = Number(text);
  const places = (text.split('.')[1] || '').length;
  if (!Number.isFinite(number) || number.toFixed(places) !== text.replace(/^0+(?=\d)/, '')) {
    throw new CoreError('QR_INVALID_AMOUNT', `Amount "${text}" cannot be represented exactly`);
  }
  return number;
}

function symbol(value, name) {
  if (value === undefined || value === null || value === '') return undefined;
  const text = String(value).trim();
  if (!SYMBOL.test(text)) throw new CoreError('QR_INVALID_SYMBOL', `${name} "${text}" must be up to 10 digits`);
  return text;
}

// YYYY-MM-DD (the app's calendar date) to YYYYMMDD (the QR field).
export function toQrDate(date) {
  if (!date) return undefined;
  const m = CALENDAR_DATE.exec(String(date));
  if (!m) throw new CoreError('QR_INVALID_DATE', `Date "${date}" is not YYYY-MM-DD`);
  return `${m[1]}${m[2]}${m[3]}`;
}

export function fromQrDate(text) {
  if (!text || !/^\d{8}$/.test(text)) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

export function normalizeIban(iban) {
  return String(iban || '').replace(/\s+/g, '').toUpperCase();
}

/**
 * @param {{iban: string, bic?: string, amount: string, currency: string, vs?: string, ks?: string,
 *   ss?: string, dueDate?: string, note?: string, beneficiary?: string}} payment
 * @returns {string} the text to put into the QR code
 */
export function encodePayBySquare(payment) {
  const iban = normalizeIban(payment.iban);
  if (!iban) throw new CoreError('QR_MISSING_IBAN', 'PAY by square needs an IBAN');
  const model = {
    invoiceId: payment.invoiceId ? String(payment.invoiceId) : undefined,
    payments: [{
      type: PaymentOptions.PaymentOrder,
      amount: amountToNumber(payment.amount),
      currencyCode: String(payment.currency || 'EUR').toUpperCase(),
      paymentDueDate: toQrDate(payment.dueDate),
      variableSymbol: symbol(payment.vs, 'VS'),
      constantSymbol: symbol(payment.ks, 'KS'),
      specificSymbol: symbol(payment.ss, 'SS'),
      paymentNote: payment.note ? String(payment.note).slice(0, 140) : undefined,
      bankAccounts: [{ iban, bic: payment.bic ? String(payment.bic).toUpperCase() : undefined }],
      beneficiary: { name: String(payment.beneficiary || '').trim() || iban }
    }]
  };
  try {
    return encode(model, { deburr: true, validate: true });
  } catch (e) {
    if (e instanceof CoreError) throw e;
    throw new CoreError('QR_ENCODE_FAILED', `PAY by square encoding failed: ${e.message}`, { cause: e.message });
  }
}

/**
 * The first payment of a PAY by square code as the app's payment shape.
 * @returns {{iban: string, bic: string|null, amount: string, currency: string, vs: string|null,
 *   ks: string|null, ss: string|null, dueDate: string|null, note: string|null, beneficiary: string|null,
 *   invoiceId: string|null}}
 */
export function decodePayBySquareText(text) {
  let model;
  try {
    model = decode(String(text || '').trim());
  } catch (e) {
    throw new CoreError('QR_DECODE_FAILED', `PAY by square decoding failed: ${e.message}`, { cause: e.message });
  }
  const p = model.payments && model.payments[0];
  if (!p) throw new CoreError('QR_DECODE_FAILED', 'PAY by square code carries no payment');
  const account = (p.bankAccounts && p.bankAccounts[0]) || {};
  return {
    iban: normalizeIban(account.iban),
    bic: account.bic || null,
    amount: p.amount === undefined || p.amount === null ? null : p.amount.toFixed(2),
    currency: p.currencyCode || 'EUR',
    vs: p.variableSymbol || null,
    ks: p.constantSymbol || null,
    ss: p.specificSymbol || null,
    dueDate: fromQrDate(p.paymentDueDate),
    note: p.paymentNote || null,
    beneficiary: (p.beneficiary && p.beneficiary.name) || null,
    invoiceId: model.invoiceId || null
  };
}
