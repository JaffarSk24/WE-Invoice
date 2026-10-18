// QR Platba (Czech Banking Association "Short Payment Descriptor" 1.0):
// a plain text string "SPD*1.0*ACC:...*AM:...*CC:CZK*X-VS:...". No
// compression, so a decoder is a split on "*". Values may use only the
// SPD character set; the asterisk is the separator and never allowed in a
// value, diacritics are stripped because not every bank reads them.
import { CoreError } from '../errors.js';
import { toQrDate, fromQrDate, normalizeIban } from './pay.js';

const AMOUNT = /^\d{1,7}(\.\d{1,2})?$/;
const SYMBOL = /^\d{1,10}$/;
const MESSAGE_MAX = 60;
const NAME_MAX = 35;

export function stripDiacritics(text) {
  return String(text).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// The SPD value character set (section 3.3 of the specification).
function spdValue(text, max) {
  return stripDiacritics(text)
    .replace(/[^0-9A-Za-z ,.\-?:;/()$%+'"@&#!=]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function symbol(value, name) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (!SYMBOL.test(text)) throw new CoreError('QR_INVALID_SYMBOL', `${name} "${text}" must be up to 10 digits`);
  return text;
}

/**
 * @param {{iban: string, bic?: string, amount: string, currency?: string, vs?: string, ks?: string,
 *   ss?: string, dueDate?: string, note?: string, beneficiary?: string}} payment
 * @returns {string} the SPD text for the QR code
 */
export function encodeSpd(payment) {
  const iban = normalizeIban(payment.iban);
  if (!iban) throw new CoreError('QR_MISSING_IBAN', 'QR Platba needs an IBAN');
  const amount = String(payment.amount ?? '').trim();
  if (!AMOUNT.test(amount)) throw new CoreError('QR_INVALID_AMOUNT', `Amount "${amount}" is not a positive decimal with up to two places`);
  const fields = [
    ['ACC', payment.bic ? `${iban}+${String(payment.bic).toUpperCase()}` : iban],
    ['AM', amount],
    ['CC', String(payment.currency || 'CZK').toUpperCase()],
    ['DT', toQrDate(payment.dueDate)],
    ['X-VS', symbol(payment.vs, 'VS')],
    ['X-KS', symbol(payment.ks, 'KS')],
    ['X-SS', symbol(payment.ss, 'SS')],
    ['MSG', payment.note ? spdValue(payment.note, MESSAGE_MAX) : null],
    ['RN', payment.beneficiary ? spdValue(payment.beneficiary, NAME_MAX) : null]
  ].filter(([, value]) => value !== null && value !== undefined && value !== '');
  return `SPD*1.0*${fields.map(([key, value]) => `${key}:${value}`).join('*')}`;
}

/** @returns {object} the payment of an SPD string (same shape as decodePayBySquare) */
export function decodeSpd(text) {
  const parts = String(text || '').trim().split('*');
  if (parts[0] !== 'SPD' || !/^\d+\.\d+$/.test(parts[1] || '')) {
    throw new CoreError('QR_DECODE_FAILED', 'Not an SPD string');
  }
  const map = {};
  parts.slice(2).forEach(part => {
    const i = part.indexOf(':');
    if (i > 0) map[part.slice(0, i)] = part.slice(i + 1);
  });
  const [iban, bic] = String(map.ACC || '').split('+');
  if (!iban) throw new CoreError('QR_DECODE_FAILED', 'SPD string carries no account');
  return {
    iban: normalizeIban(iban),
    bic: bic || null,
    amount: map.AM ? Number(map.AM).toFixed(2) : null,
    currency: map.CC || 'CZK',
    vs: map['X-VS'] || null,
    ks: map['X-KS'] || null,
    ss: map['X-SS'] || null,
    dueDate: fromQrDate(map.DT),
    note: map.MSG || null,
    beneficiary: map.RN || null,
    invoiceId: null
  };
}
