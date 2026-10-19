// One shape for every statement format: the fields of a bankTransactions
// record (packages/core/schema, BankAccountTx) without the store fields.
// Symbols given in their own fields win over the ones read from the
// reference and the message; a domestic counter account becomes an IBAN;
// texts are trimmed to the schema limits. Import keys make a repeated
// import of the same statement find the records it already created.
import { parseSymbols, symbolDigits, counterpartyIban, shortHash, normalizeText } from './text.js';

const LIMITS = { counterpartyName: 500, ref: 200, message: 10000 };

const clean = (value, max) => {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

/**
 * @param {object} raw  { line?, date, valueDate?, amount, currency?, counterpartyName?, counterpartyAccount?,
 *   counterpartyBankCode?, vs?, ks?, ss?, symbols?, message?, ref?, fee?, bankRef? }
 * @param {{currency?: string, country?: string}} [context]
 */
export function normalizeTransaction(raw, context = {}) {
  const fromText = parseSymbols([raw.symbols, raw.ref, raw.message].filter(Boolean).join(' '));
  const symbol = (key, max) => symbolDigits(raw[key], max) || fromText[key];
  const account = clean(raw.counterpartyAccount, 60);
  const tx = {
    date: raw.date,
    valueDate: raw.valueDate || null,
    amount: raw.amount,
    currency: String(raw.currency || context.currency || 'EUR').trim().toUpperCase().slice(0, 3),
    counterpartyName: clean(raw.counterpartyName, LIMITS.counterpartyName),
    counterpartyIban: account ? counterpartyIban(account, raw.counterpartyBankCode, context.country) : null,
    counterpartyAccount: account,
    vs: symbol('vs', 10),
    ks: symbol('ks', 4),
    ss: symbol('ss', 10),
    message: clean(raw.message, LIMITS.message),
    ref: clean(raw.ref, LIMITS.ref)
  };
  if (raw.fee) tx.fee = raw.fee;
  if (raw.bankRef) tx.bankRef = clean(raw.bankRef, LIMITS.ref);
  if (raw.line) tx.line = raw.line;
  return tx;
}

/**
 * Import key of one transaction (account + date + amount + ref, the rule
 * of 03-features.md § 3.9). Without a bank reference the message and the
 * counterparty stand in, hashed. `n` tells apart identical lines of one file.
 */
export function importKey(accountId, tx, n = 0) {
  const ref = tx.ref ? tx.ref : `h:${shortHash(normalizeText([tx.counterpartyIban, tx.counterpartyName, tx.vs, tx.message].join('|')))}`;
  const base = `${accountId}|${tx.date}|${tx.amount}|${ref.length > 120 ? `h:${shortHash(ref)}` : ref}`;
  return n ? `${base}#${n}` : base;
}

/** Transactions with accountId and importKey; identical lines get a counter in file order. */
export function withImportKeys(accountId, transactions) {
  const seen = new Map();
  return transactions.map(tx => {
    const base = importKey(accountId, tx, 0);
    const n = seen.get(base) || 0;
    seen.set(base, n + 1);
    return { ...tx, accountId, importKey: n ? importKey(accountId, tx, n) : base };
  });
}

/**
 * Splits keyed transactions into the new ones and the ones already stored
 * (same importKey among the live records of the collection).
 * @returns {{fresh: object[], duplicates: object[]}}
 */
export function splitDuplicates(transactions, existing = []) {
  const known = new Set(existing.filter(r => !r.deleted).map(r => r.importKey));
  const fresh = [];
  const duplicates = [];
  transactions.forEach(tx => (known.has(tx.importKey) ? duplicates : fresh).push(tx));
  return { fresh, duplicates };
}
