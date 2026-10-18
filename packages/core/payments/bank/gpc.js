// ABO / GPC, the fixed-width statement of Czech banks (and some Slovak
// ones): record 074 is the statement header with balances, 075 one
// transaction, 076 to 079 carry the counterparty name and message lines
// of the 075 above them. Amounts are in hundredths, dates DDMMYY, the
// currency is the numeric ISO 4217 code.
import { normalizeTransaction } from './normalize.js';
import { parseStatementDate, signedAmount } from './values.js';
import { ibanFromDomestic } from './text.js';
import { div, round } from '../../money/index.js';
import { CoreError } from '../../errors.js';

const NUMERIC_CURRENCY = { '978': 'EUR', '203': 'CZK', '840': 'USD', '826': 'GBP', '348': 'HUF', '985': 'PLN', '756': 'CHF' };

const slice = (line, from, to) => line.slice(from - 1, to);
const cents = (s) => round(div(String(Number(s.trim() || '0')), '100', 2), 2);

// "000000" + "0123456789" -> "123456789"; with a prefix "19-123456789".
function account(field) {
  const s = field.replace(/\D/g, '').padStart(16, '0');
  const prefix = s.slice(0, 6).replace(/^0+/, '');
  const number = s.slice(6).replace(/^0+/, '');
  if (!number) return null;
  return prefix ? `${prefix}-${number}` : number;
}

function header(line) {
  const sign = (s) => (s === '-' ? '-' : '');
  return {
    account: account(slice(line, 4, 19)),
    openingBalance: { amount: round(`${sign(slice(line, 60, 60))}${cents(slice(line, 46, 59))}`, 2), date: parseStatementDate(slice(line, 40, 45), 'dmy6') },
    closingBalance: { amount: round(`${sign(slice(line, 75, 75))}${cents(slice(line, 61, 74))}`, 2), date: parseStatementDate(slice(line, 109, 114), 'dmy6') }
  };
}

function transaction(line) {
  const code = slice(line, 61, 61);
  const debit = code === '1' || code === '5';
  const bankCode = slice(line, 74, 77);
  const counter = account(slice(line, 20, 35));
  const currency = NUMERIC_CURRENCY[String(Number(slice(line, 119, 122)))] || null;
  return {
    date: parseStatementDate(slice(line, 123, 128), 'dmy6') || parseStatementDate(slice(line, 92, 97), 'dmy6'),
    valueDate: parseStatementDate(slice(line, 92, 97), 'dmy6'),
    amount: signedAmount(cents(slice(line, 49, 60)), debit),
    currency,
    counterpartyName: slice(line, 98, 117).trim(),
    counterpartyAccount: counter && /^\d{4}$/.test(bankCode) && bankCode !== '0000' ? `${counter}/${bankCode}` : counter,
    vs: slice(line, 62, 71),
    ks: slice(line, 78, 81),
    ss: slice(line, 82, 91),
    ref: slice(line, 36, 48).trim().replace(/^0+(?=\d)/, '') || null,
    message: ''
  };
}

/** @returns {{format: 'GPC', account: object, openingBalance: object|null, closingBalance: object|null, transactions: object[], warnings: string[], invalid: number, pending: number}} */
export function parseGpc(text, options = {}) {
  const lines = String(text ?? '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.some(l => l.startsWith('075'))) throw new CoreError('BANK_FORMAT_UNKNOWN', 'not an ABO/GPC statement');
  const country = options.country || 'CZ';
  let head = null;
  let invalid = 0;
  const raws = [];
  lines.forEach(line => {
    const kind = line.slice(0, 3);
    if (kind === '074' && !head) head = header(line);
    else if (kind === '075') {
      if (line.length < 97) { invalid++; return; }
      raws.push(transaction(line.padEnd(128, ' ')));
    } else if (/^07[6-9]$/.test(kind) && raws.length) {
      const last = raws[raws.length - 1];
      const content = line.slice(3).trim();
      if (kind === '076' && !last.counterpartyName) last.counterpartyName = content;
      else last.message = [last.message, content].filter(Boolean).join(' ');
    }
  });
  const transactions = raws.filter(r => r.date).map(r => normalizeTransaction(r, { currency: r.currency || options.currency || (country === 'CZ' ? 'CZK' : 'EUR'), country }));
  invalid += raws.filter(r => !r.date).length;
  const account0 = head ? { iban: ibanFromDomestic(country, head.account, options.bankCode), domestic: head.account, currency: transactions[0]?.currency || null } : { iban: null, currency: null };
  return {
    format: 'GPC', account: account0, openingBalance: head?.openingBalance || null, closingBalance: head?.closingBalance || null,
    transactions, warnings: invalid ? ['BANK_ROWS_INVALID'] : [], invalid, pending: 0
  };
}
