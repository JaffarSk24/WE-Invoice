// Rules around cash: the B2B cash payment limit of zákon č. 394/2012 Z. z.
// (cashPaymentLimitB2b in legislation, valid on the payment date) and the
// CSV of the pokladničná kniha. The law counts the whole deal: cash paid
// earlier on the same document adds up, and splitting a payment does not
// get around it.
import { getLegislation } from '../../legislation/index.js';
import { add, div, cmp, round, abs } from '../../money/index.js';

const CASH = 'CASH';
const BOM = String.fromCharCode(0xfeff);

/** A party that acts as a business: a company contact or one with an IČO. */
export function isBusinessParty(party) {
  if (!party) return false;
  return party.kind === 'COMPANY' || Boolean(party.ico);
}

/**
 * B2B cash limit check for one more cash payment on a document.
 * @param {{amount: string, date: string, currency?: string, fxRate?: string|null, document?: object, b2b: boolean, country?: string}} input
 * @returns {{applies: boolean, exceeded: boolean|null, limit: string|null, total: string|null}}
 *   exceeded null when a foreign currency amount has no rate to EUR
 */
export function cashLimitCheck(input) {
  const { amount, date, currency = 'EUR', fxRate = null, document = null, b2b, country = 'SK' } = input;
  if (!b2b) return { applies: false, exceeded: false, limit: null, total: null };
  const limit = round(getLegislation('cashPaymentLimitB2b.amount', date, country), 2);
  const earlier = (document?.payments || []).filter(p => !p.deleted && p.method === CASH).reduce((s, p) => add(s, abs(p.amount)), '0');
  const total = round(add(earlier, abs(amount)), 2);
  if (currency !== 'EUR') {
    if (!fxRate) return { applies: true, exceeded: null, limit, total: null };
    const eur = round(div(total, fxRate, 4), 2);
    return { applies: true, exceeded: cmp(eur, limit) > 0, limit, total: eur };
  }
  return { applies: true, exceeded: cmp(total, limit) > 0, limit, total };
}

function csvCell(value, delimiter) {
  const s = String(value ?? '');
  return /["\n\r]/.test(s) || s.includes(delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The pokladničná kniha as CSV for a spreadsheet: a byte order mark, ";"
 * between cells and a decimal comma (how Slovak Excel opens it), the
 * opening balance first and the totals last. Labels come from the caller
 * in the user's language.
 * @param {{opening: string, closing: string, income: string, expense: string, rows: object[]}} book  cashBookRows()
 * @param {{date: string, number: string, partner: string, purpose: string, income: string, expense: string, balance: string,
 *   opening: string, closing: string, kindIn: string, kindOut: string, kind: string}} labels
 */
export function cashBookCsv(book, labels, { delimiter = ';', decimalComma = true } = {}) {
  const num = (v) => (v === null || v === undefined ? '' : decimalComma ? String(v).replace('.', ',') : String(v));
  const line = (cells) => cells.map(c => csvCell(c, delimiter)).join(delimiter);
  const out = [line([labels.date, labels.number, labels.kind, labels.partner, labels.purpose, labels.income, labels.expense, labels.balance])];
  out.push(line(['', '', '', '', labels.opening, '', '', num(book.opening)]));
  book.rows.forEach(r => out.push(line([
    r.date, r.number, r.kind === 'CASH_IN' ? labels.kindIn : labels.kindOut, r.partner, r.purpose, num(r.income), num(r.expense), num(r.balance)
  ])));
  out.push(line(['', '', '', '', labels.closing, num(book.income), num(book.expense), num(book.closing)]));
  return `${BOM}${out.join('\r\n')}\r\n`;
}
