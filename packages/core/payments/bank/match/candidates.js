// Which documents a bank transaction can pay and what is still open on
// them. Money coming in pays our invoices (and refunds of received credit
// notes); money going out pays received invoices (and refunds of our
// credit notes). Drafts, cancelled documents and other currencies are
// never candidates. Amounts already reserved by earlier lines of the same
// statement (`pending`) are taken off, so two partial payments of one
// invoice in one statement are matched one after the other.
import { amountDue, paymentState } from '../../index.js';
import { isPayable } from '../../../documents/kinds.js';
import { abs, sub, round, cmp, isNegative, isZero } from '../../../money/index.js';
import { normalizeText, symbolDigits, compactIban } from '../text.js';

const INCOMING = new Set(['INVOICE', 'PROFORMA', 'ADVANCE_TAX_DOC', 'DEBIT_NOTE', 'SALES_RECEIPT', 'RECEIVED_CREDIT_NOTE']);
const OUTGOING = new Set(['RECEIVED_INVOICE', 'EXPENSE_RECEIPT', 'CREDIT_NOTE', 'SELF_BILLING']);
const CLOSED = new Set(['DRAFT', 'CANCELLED']);
const FROM_SUPPLIER = new Set(['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT', 'SELF_BILLING']);

/** 'IN' for money received, 'OUT' for money paid. */
export function directionOf(tx) {
  return isNegative(tx.amount) ? 'OUT' : 'IN';
}

/** True when a document of this kind is paid by money in that direction. */
export function kindFitsDirection(kind, direction) {
  return direction === 'IN' ? INCOMING.has(kind) : OUTGOING.has(kind);
}

/** The party a document is about: the buyer of ours, the seller of a received one. */
export function partyOf(document) {
  return FROM_SUPPLIER.has(document.kind) ? document.seller : document.buyer;
}

/** Still open amount (positive), less what `pending` already reserves. */
export function openAmount(document, pending = new Map()) {
  const due = round(abs(amountDue(document)), 2);
  const state = paymentState(document);
  if (state === 'PAID' || state === 'OVERPAID') return '0.00';
  const reserved = pending.get(document.id);
  return reserved ? round(sub(due, reserved), 2) : due;
}

/**
 * Documents the transaction may pay, with what is open on each.
 * @returns {Array<{doc: object, open: string, contact: object|null}>}
 */
export function candidatesFor(tx, documents, contacts = [], pending = new Map()) {
  const direction = directionOf(tx);
  const byId = new Map((contacts || []).map(c => [c.id, c]));
  const out = [];
  for (const doc of documents || []) {
    if (doc.deleted || CLOSED.has(doc.status) || !isPayable(doc.kind) || !kindFitsDirection(doc.kind, direction)) continue;
    if (doc.currency && tx.currency && doc.currency !== tx.currency) continue;
    const open = openAmount(doc, pending);
    if (cmp(open, '0') <= 0 || isZero(open)) continue;
    out.push({ doc, open, contact: byId.get(doc.contactId) || null });
  }
  return out;
}

/**
 * Payments recorded by hand that a bank movement may confirm: a document
 * the user marked paid before importing the statement. Same direction and
 * amount, not from a statement, not cash of a cash book, not an offset,
 * not tied to a movement yet, and not reserved (`taken`) by an earlier line.
 * @returns {Array<{doc: object, open: string, contact: object|null, paymentId: string}>}
 */
export function recordedFor(tx, documents, contacts = [], taken = new Set()) {
  const direction = directionOf(tx);
  const paid = round(abs(tx.amount), 2);
  const byId = new Map((contacts || []).map(c => [c.id, c]));
  const out = [];
  for (const doc of documents || []) {
    if (doc.deleted || CLOSED.has(doc.status) || !isPayable(doc.kind) || !kindFitsDirection(doc.kind, direction)) continue;
    if (doc.currency && tx.currency && doc.currency !== tx.currency) continue;
    for (const p of doc.payments || []) {
      if (p.bankTxId || p.source === 'BANK_IMPORT' || p.source === 'CASH' || p.method === 'OFFSET' || taken.has(p.id)) continue;
      if (cmp(round(abs(p.amount), 2), paid) !== 0) continue;
      out.push({ doc, open: paid, contact: byId.get(doc.contactId) || null, paymentId: p.id });
    }
  }
  return out;
}

// Legal form words that differ between how a name is written on an
// invoice and in a bank statement.
const LEGAL_FORMS = /\b(s ?r ?o|spol|a ?s|k ?s|v ?o ?s|s ?p|gmbh|ag|ltd|llc|inc|sa|se|z ?s|n ?o|o ?z)\b/g;

/** A company name as statements and invoices both write it. */
export function comparableName(name) {
  return normalizeText(name).replace(/[.,&()"'/-]/g, ' ').replace(LEGAL_FORMS, ' ').replace(/\s+/g, ' ').trim();
}

/** True when two names mean the same party (equal, or one holds the other as words). */
export function namesMatch(a, b) {
  const x = comparableName(a);
  const y = comparableName(b);
  if (x.length < 3 || y.length < 3) return false;
  if (x === y) return true;
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  return short.length >= 4 && ` ${long} `.includes(` ${short} `);
}

/** The IBAN of the document's party: the contact card, else the document's own bank account for received ones. */
export function partyIban(candidate) {
  return compactIban(candidate.contact?.iban) || compactIban(candidate.doc.counterpartyIban) || null;
}

/** Variable symbol of a document without leading zeros. */
export function docVs(document) {
  return symbolDigits(document.vs || '') || null;
}

/** Text of the transaction where references can hide, compacted for search. */
export function searchText(tx) {
  return [tx.message, tx.ref, tx.symbols].filter(Boolean).join(' ').toUpperCase().replace(/[\s-]/g, '');
}

/** All digit runs in the transaction texts, without leading zeros. */
export function digitRuns(tx) {
  const text = [tx.message, tx.ref].filter(Boolean).join(' ');
  return new Set((text.match(/\d{3,10}/g) || []).map(d => d.replace(/^0+(?=\d)/, '')));
}
