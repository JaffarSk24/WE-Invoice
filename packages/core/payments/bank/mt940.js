// MT940 (SWIFT customer statement). A :61: line is one transaction, the
// :86: after it describes it. :86: comes in three shapes: German-style
// subfields (?20 to ?29 text, ?32 ?33 name, ?31 account, ?30 bank code),
// keyword style (/NAME/ /REMI/ /EREF/ /IBAN/) or free text; the payment
// symbols are read from whichever text there is.
import { normalizeTransaction } from './normalize.js';
import { parseStatementAmount, signedAmount } from './values.js';
import { compactIban } from './text.js';
import { CoreError } from '../../errors.js';

// Tags with their (possibly multi-line) content, in file order.
function fields(text) {
  const out = [];
  String(text ?? '').split(/\r?\n/).forEach(line => {
    const m = /^:(\d{2}[A-Z]?):(.*)$/.exec(line);
    if (m) out.push({ tag: m[1], value: m[2] });
    else if (out.length && line.trim() !== '-' && !/^-\}?$/.test(line.trim()) && !/^\{/.test(line)) out[out.length - 1].value += `\n${line}`;
  });
  return out;
}

const yymmdd = (s) => `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;

function balanceOf(value) {
  const m = /^([CD])(\d{6})([A-Z]{3})([\d,.]+)/.exec(value.trim());
  if (!m) return null;
  const amount = parseStatementAmount(m[4]);
  return amount === null ? null : { amount: signedAmount(amount, m[1] === 'D'), date: yymmdd(m[2]), currency: m[3] };
}

const LINE61 = /^(\d{6})(\d{4})?(RC|RD|C|D)([A-Z])?(\d+(?:,\d*)?)([NFS][A-Z0-9]{3})([^\n]*?)(?:\/\/([^\n]*))?(?:\n([\s\S]*))?$/;

function statementLine(value) {
  const m = LINE61.exec(value.trim());
  if (!m) return null;
  const valueDate = yymmdd(m[1]);
  let date = valueDate;
  if (m[2]) {
    let year = Number(valueDate.slice(0, 4));
    const month = m[2].slice(0, 2);
    if (month === '12' && valueDate.slice(5, 7) === '01') year -= 1;
    if (month === '01' && valueDate.slice(5, 7) === '12') year += 1;
    date = `${year}-${month}-${m[2].slice(2, 4)}`;
  }
  const debit = m[3] === 'D' || m[3] === 'RC';
  const amount = parseStatementAmount(m[5]);
  const customerRef = m[7].trim();
  return {
    date, valueDate,
    amount: amount === null ? null : signedAmount(amount, debit),
    ref: m[8] ? m[8].trim() : (customerRef && customerRef !== 'NONREF' ? customerRef : null),
    symbols: customerRef && customerRef !== 'NONREF' ? customerRef : null,
    extra: (m[9] || '').trim()
  };
}

function information(value) {
  const text = value.replace(/\n/g, '');
  const info = { name: null, account: null, bankCode: null, message: null, eref: null };
  if (/\?\d{2}/.test(text)) {
    const parts = {};
    text.split(/\?(?=\d{2})/).slice(1).forEach(p => { parts[p.slice(0, 2)] = (parts[p.slice(0, 2)] || '') + p.slice(2); });
    const textKeys = Object.keys(parts).filter(k => (k >= '20' && k <= '29') || (k >= '60' && k <= '63')).sort();
    info.message = textKeys.map(k => parts[k]).join('').trim() || null;
    info.name = [parts['32'], parts['33']].filter(Boolean).join('').trim() || null;
    info.account = parts['31'] ? parts['31'].trim() : null;
    info.bankCode = parts['30'] ? parts['30'].trim() : null;
    return info;
  }
  if (/\/(NAME|REMI|EREF|IBAN)\//.test(text)) {
    const grab = (k) => {
      const m = new RegExp(`/${k}/(.*?)(?=/(?:NAME|REMI|EREF|IBAN|ORDP|BENM|CDTRREFTP|CDTRREF|PURP|ULTD|ULTC)/|$)`).exec(text);
      return m ? m[1].trim() : null;
    };
    info.name = grab('NAME');
    info.account = grab('IBAN');
    info.eref = grab('EREF');
    info.message = grab('REMI') || null;
    return info;
  }
  info.message = value.replace(/\n/g, ' ').trim() || null;
  return info;
}

/** @returns {{format: 'MT940', account: object, openingBalance: object|null, closingBalance: object|null, transactions: object[], warnings: string[], invalid: number, pending: number}} */
export function parseMt940(text, options = {}) {
  const list = fields(text);
  if (!list.some(f => f.tag === '61') && !list.some(f => f.tag === '20')) throw new CoreError('BANK_FORMAT_UNKNOWN', 'not an MT940 statement');
  const account = { iban: null, currency: null };
  let opening = null;
  let closing = null;
  let current = null;
  let invalid = 0;
  const raws = [];
  list.forEach(f => {
    if (f.tag === '25') {
      const m = /([A-Z]{2}\d{2}[A-Z0-9]{11,30})/.exec(f.value.replace(/\s/g, ''));
      if (m && !account.iban) account.iban = compactIban(m[1]);
    } else if (f.tag === '60F' || f.tag === '60M') {
      const b = balanceOf(f.value);
      if (b && !opening) { opening = b; account.currency = b.currency; }
    } else if (f.tag === '62F' || f.tag === '62M') {
      closing = balanceOf(f.value) || closing;
    } else if (f.tag === '61') {
      current = statementLine(f.value);
      if (!current || current.amount === null) { invalid++; current = null; return; }
      raws.push(current);
    } else if (f.tag === '86' && current) {
      current.info = information(f.value);
      current = null;
    }
  });
  const currency = account.currency || options.currency || 'EUR';
  const transactions = raws.map(r => normalizeTransaction({
    date: r.date, valueDate: r.valueDate, amount: r.amount, currency,
    counterpartyName: r.info?.name, counterpartyAccount: r.info?.account, counterpartyBankCode: r.info?.bankCode,
    symbols: [r.symbols, r.info?.eref].filter(Boolean).join(' '),
    message: r.info?.message || r.extra || null,
    ref: r.ref
  }, { currency, country: options.country || account.iban?.slice(0, 2) }));
  return {
    format: 'MT940', account, openingBalance: opening && { amount: opening.amount, date: opening.date },
    closingBalance: closing && { amount: closing.amount, date: closing.date },
    transactions, warnings: invalid ? ['BANK_ROWS_INVALID'] : [], invalid, pending: 0
  };
}
