// CAMT.053 (ISO 20022 BankToCustomerStatement), the main statement format
// of Slovak banks. Versions 02 to 08 all share the paths read here. An
// entry (Ntry) with several transaction details (a batch) becomes one
// transaction per detail with its own amount; only booked entries count.
// For a credit the counterparty is the debtor, for a debit the creditor;
// a card payment or withdrawal names the shop or the cash machine as the
// trading party. Tatra banka puts its own markup into AddtlNtryInf
// (<NtryInf Ctg=...><Nrtv>Platba ...</Nrtv></NtryInf>): only the narrative
// is kept. Zero entries (a free fee package) are skipped.
import { parseXml, all, one, textAt } from './xml/read.js';
import { normalizeTransaction } from './normalize.js';
import { parseStatementAmount, signedAmount } from './values.js';
import { isZero } from '../../money/index.js';
import { CoreError } from '../../errors.js';

const dateOf = (node, path) => {
  const value = textAt(node, `${path}/Dt`) || textAt(node, `${path}/DtTm`);
  return value ? value.slice(0, 10) : null;
};

function party(details, role) {
  const base = one(details, `RltdPties/${role}`);
  const name = textAt(base, 'Nm') || textAt(base, 'Pty/Nm') || textAt(details, 'RltdPties/TradgPty/Nm');
  const account = one(details, `RltdPties/${role}Acct`);
  const iban = textAt(account, 'Id/IBAN') || textAt(account, 'Id/Othr/Id');
  return { name, iban };
}

function remittance(details) {
  const lines = all(details, 'RmtInf/Ustrd').map(n => n.text.trim()).filter(Boolean);
  const refs = all(details, 'RmtInf/Strd/CdtrRefInf/Ref').map(n => n.text.trim()).filter(Boolean);
  return [...lines, ...refs].join(' ');
}

/** The readable part of AddtlNtryInf: the narrative of the bank's own markup, else the text without tags. */
export function narrative(text) {
  const s = String(text || '');
  const inner = /<Nrtv>([\s\S]*?)<\/Nrtv>/.exec(s);
  const plain = (inner ? inner[1] : s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return plain || null;
}

function balance(stmt, code) {
  const node = all(stmt, 'Bal').find(b => textAt(b, 'Tp/CdOrPrtry/Cd') === code);
  if (!node) return null;
  const amount = parseStatementAmount(textAt(node, 'Amt'));
  return amount === null ? null : { amount: signedAmount(amount, textAt(node, 'CdtDbtInd') === 'DBIT'), date: dateOf(node, 'Dt') };
}

function entryTransactions(entry, currency, status) {
  const debit = textAt(entry, 'CdtDbtInd') === 'DBIT';
  const date = dateOf(entry, 'BookgDt') || dateOf(entry, 'ValDt');
  const valueDate = dateOf(entry, 'ValDt');
  const entryAmount = parseStatementAmount(textAt(entry, 'Amt'));
  const entryCurrency = one(entry, 'Amt')?.attrs.Ccy || currency;
  const bankRef = textAt(entry, 'AcctSvcrRef') || textAt(entry, 'NtryRef');
  const details = all(entry, 'NtryDtls/TxDtls');
  const list = details.length ? details : [null];
  return list.map((d, n) => {
    const own = d && (one(d, 'AmtDtls/TxAmt/Amt') || one(d, 'Amt'));
    const amount = list.length > 1 && own ? parseStatementAmount(own.text) : entryAmount;
    const counter = party(d, debit ? 'Cdtr' : 'Dbtr');
    const e2e = textAt(d, 'Refs/EndToEndId');
    const ref = textAt(d, 'Refs/AcctSvcrRef') || textAt(d, 'Refs/TxId') || (bankRef ? `${bankRef}${list.length > 1 ? `-${n + 1}` : ''}` : null);
    return {
      status,
      raw: {
        date, valueDate,
        amount: amount === null ? null : signedAmount(amount, debit),
        currency: (own && own.attrs.Ccy) || entryCurrency,
        counterpartyName: counter.name,
        counterpartyAccount: counter.iban,
        symbols: e2e && e2e !== 'NOTPROVIDED' ? e2e : null,
        message: remittance(d) || narrative(textAt(entry, 'AddtlNtryInf')),
        ref
      }
    };
  });
}

/**
 * @returns {{format: 'CAMT053', account: {iban: string|null, currency: string|null}, openingBalance: object|null,
 *   closingBalance: object|null, transactions: object[], warnings: string[], pending: number, invalid: number}}
 */
export function parseCamt053(text, options = {}) {
  const doc = parseXml(text);
  const stmts = all(doc, 'BkToCstmrStmt/Stmt');
  if (!stmts.length) throw new CoreError('BANK_FORMAT_UNKNOWN', 'not a CAMT.053 statement');
  const transactions = [];
  let pending = 0;
  let invalid = 0;
  const stmt0 = stmts[0];
  const account = { iban: textAt(stmt0, 'Acct/Id/IBAN'), currency: textAt(stmt0, 'Acct/Ccy') };
  for (const stmt of stmts) {
    const currency = textAt(stmt, 'Acct/Ccy') || options.currency || 'EUR';
    for (const entry of all(stmt, 'Ntry')) {
      const status = textAt(entry, 'Sts/Cd') || textAt(entry, 'Sts') || 'BOOK';
      for (const { raw } of entryTransactions(entry, currency, status)) {
        if (status !== 'BOOK') { pending++; continue; }
        if (!raw.date || raw.amount === null) { invalid++; continue; }
        if (isZero(raw.amount)) continue;
        transactions.push(normalizeTransaction(raw, { currency, country: options.country }));
      }
    }
  }
  const warnings = [];
  if (pending) warnings.push('BANK_ROWS_PENDING');
  if (invalid) warnings.push('BANK_ROWS_INVALID');
  return {
    format: 'CAMT053', account, openingBalance: balance(stmt0, 'OPBD'), closingBalance: balance(stmts[stmts.length - 1], 'CLBD'),
    transactions, warnings, pending, invalid
  };
}
