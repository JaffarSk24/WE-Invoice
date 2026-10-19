// QR codes found on received documents: PAY by square and QR Platba carry
// the payment (IBAN, amount, symbols, due date); an eKasa receipt QR
// carries the receipt id that the gateway turns into the full receipt
// (POST /v1/ekasa/receipt), or, on an offline receipt, the OKP, the cash
// register, the time and the amount.
import { decodePayBySquare, decodeQrPlatba } from '../../paybysquare/index.js';
import { localDate } from '../../documents/dates.js';
import { add, sub, div, mul, round, sum, parseAmount } from '../../money/index.js';
import { emptyRecognition, setField, finish } from './result.js';
import { classifyId, normalizeId } from './party.js';

const ONLINE = /\bO-[0-9A-F]{32}\b/i;
const OFFLINE = /([0-9A-F]{8}(?:-[0-9A-F]{8}){4}):(\d{17}):(\d{12}):(\d+):(\d+(?:\.\d{1,2})?)/i;

/**
 * Parses the content of an eKasa receipt QR code.
 * @returns {{kind: 'ONLINE', receiptId: string}|{kind: 'OFFLINE', receiptId: null, okp: string,
 *   cashRegisterCode: string, issueDate: string, issueTime: string, receiptNumber: string, amount: string}|null}
 */
export function parseEkasaQr(text) {
  const s = String(text || '').trim();
  const online = ONLINE.exec(s);
  if (online) return { kind: 'ONLINE', receiptId: online[0].toUpperCase() };
  const offline = OFFLINE.exec(s);
  if (!offline) return null;
  const [, okp, cashRegisterCode, stamp, receiptNumber, amount] = offline;
  const d = stamp.match(/\d{2}/g);
  return {
    kind: 'OFFLINE', receiptId: null, okp: okp.toUpperCase(), cashRegisterCode,
    issueDate: `20${d[0]}-${d[1]}-${d[2]}`, issueTime: `${d[3]}:${d[4]}:${d[5]}`, receiptNumber, amount: parseAmount(amount)
  };
}

/** 'PAY_BY_SQUARE' | 'QR_PLATBA' | 'EKASA' | null for the text of a QR code. */
export function detectQrFormat(text) {
  const s = String(text || '').trim();
  if (s.startsWith('SPD*')) return 'QR_PLATBA';
  if (parseEkasaQr(s)) return 'EKASA';
  if (/^[0-9A-V]{20,}$/.test(s)) return 'PAY_BY_SQUARE';
  return null;
}

function fromPayment(format, payment) {
  const r = emptyRecognition(format);
  setField(r, 'iban', payment.iban, 'qr', 1);
  setField(r, 'bic', payment.bic, 'qr', 1);
  setField(r, 'total', payment.amount, 'qr', 1);
  setField(r, 'currency', payment.currency, 'qr', 1);
  ['vs', 'ks', 'ss', 'dueDate'].forEach(k => setField(r, k, payment[k], 'qr', 1));
  // Banking apps often strip diacritics from the name: a printed name wins.
  setField(r, 'supplierName', payment.beneficiary, 'qr', 0.5);
  setField(r, 'number', payment.invoiceId, 'qr', 0.9);
  setField(r, 'kind', 'RECEIVED_INVOICE', 'qr', 0.6);
  return finish(r);
}

/**
 * Recognition of a QR code text, or null when it is none of the known
 * kinds. An online eKasa receipt comes back with receipt.receiptId: the
 * caller asks the gateway for the receipt and passes the answer to
 * recognizeEkasaReceipt.
 */
export function recognizeQr(text) {
  const format = detectQrFormat(text);
  if (format === 'QR_PLATBA') return fromPayment(format, decodeQrPlatba(text));
  if (format === 'PAY_BY_SQUARE') {
    try { return fromPayment(format, decodePayBySquare(text)); } catch (e) { return null; }
  }
  if (format !== 'EKASA') return null;
  const qr = parseEkasaQr(text);
  const r = emptyRecognition('EKASA');
  setField(r, 'kind', 'EXPENSE_RECEIPT', 'qr', 1);
  r.receipt = qr;
  if (qr.kind === 'OFFLINE') {
    setField(r, 'total', qr.amount, 'qr', 1);
    setField(r, 'issueDate', qr.issueDate, 'qr', 1);
    setField(r, 'number', qr.receiptNumber, 'qr', 0.9);
    setField(r, 'currency', 'EUR', 'qr', 1);
  } else {
    setField(r, 'number', qr.receiptId, 'qr', 1);
  }
  return finish(r);
}

// Gross per VAT rate split into base and VAT (receipt prices include VAT).
function breakdownOfItems(items) {
  const byRate = new Map();
  items.forEach(i => byRate.set(i.vatRate, add(byRate.get(i.vatRate) || '0', i.price)));
  return [...byRate.entries()].map(([rate, gross]) => {
    const base = round(div(mul(gross, '100'), add('100', rate), 6), 2);
    return { category: /[1-9]/.test(rate) ? 'S' : 'O', rate, base, vat: round(sub(gross, base), 2) };
  });
}

/**
 * Recognition of a receipt as the gateway returns it (EkasaReceipt in
 * gateway/openapi.yaml). The payment method is not on the receipt: the
 * user picks cash or card.
 */
export function recognizeEkasaReceipt(receipt) {
  const r = emptyRecognition('EKASA');
  const seller = receipt.seller || {};
  setField(r, 'kind', 'EXPENSE_RECEIPT', 'ekasa', 1);
  setField(r, 'number', receipt.receiptId, 'ekasa', 1);
  setField(r, 'supplierName', seller.name, 'ekasa', 1);
  for (const value of [seller.ico, seller.dic, seller.icDph].filter(Boolean)) {
    const kind = classifyId(value);
    setField(r, kind || 'ico', kind ? normalizeId(kind, value) : String(value), 'ekasa', 1);
  }
  if (seller.address) setField(r, 'supplierAddress', { street: seller.address, city: '', zip: '', country: 'SK' }, 'ekasa', 1);
  if (receipt.issuedAt) {
    const day = localDate(new Date(receipt.issuedAt));
    setField(r, 'issueDate', day, 'ekasa', 1);
    setField(r, 'taxDate', day, 'ekasa', 1);
  }
  const items = (receipt.items || []).map(i => ({ name: i.name || '', qty: parseAmount(i.qty) || '1', price: parseAmount(i.price) || '0', vatRate: parseAmount(i.vatRate) || '0' }));
  const breakdown = breakdownOfItems(items);
  setField(r, 'breakdown', breakdown, 'ekasa', 1);
  setField(r, 'net', round(sum(breakdown.map(b => b.base)), 2), 'ekasa', 1);
  setField(r, 'vat', round(sum(breakdown.map(b => b.vat)), 2), 'ekasa', 1);
  setField(r, 'total', parseAmount(receipt.totals?.total) || round(sum(items.map(i => i.price)), 2), 'ekasa', 1);
  setField(r, 'currency', 'EUR', 'ekasa', 1);
  setField(r, 'lines', items.map(i => ({
    name: i.name, qty: i.qty, unitPrice: round(div(i.price, /[1-9]/.test(i.qty) ? i.qty : '1', 6), 4), priceType: 'GROSS',
    vatCategory: /[1-9]/.test(i.vatRate) ? 'S' : 'O', vatRate: i.vatRate
  })), 'ekasa', 1);
  r.receipt = { kind: 'ONLINE', receiptId: receipt.receiptId, okp: receipt.okp || null };
  return finish(r);
}
