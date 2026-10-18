// Zápočet (dohoda o započítaní pohľadávok): what we are owed by a party
// and what we owe it cancel out up to the smaller of the two sums. The
// protocol is an INTERNAL document with the offset details; every
// document it touches gets a payment of method OFFSET that points back to
// it, so the payment state, the reports and the ledger see the offset
// like any other payment, and cancelling the protocol removes exactly
// those payments.
import { candidatesFor } from './match/candidates.js';
import { makePayment, addPayment, removePayments } from './apply.js';
import { nextNumber } from '../../numbering/index.js';
import { add, cmp, round, sub, isZero } from '../../money/index.js';
import { uuidv7 } from '../../ids/index.js';
import { CoreError } from '../../errors.js';

const OFFSET_SERIES = Object.freeze({ id: 'offset', kind: 'INTERNAL', mask: 'ZAP{YYYY}{N:3}', reset: 'YEARLY', counters: {} });

const byDue = (a, b) => String(a.doc.dueDate || a.doc.issueDate || '').localeCompare(String(b.doc.dueDate || b.doc.issueDate || ''));
const total = (list) => round(list.reduce((s, c) => add(s, c.open), '0'), 2);

/**
 * Open documents of one contact on both sides, in one currency.
 * @returns {{receivables: Array<{doc, open}>, payables: Array<{doc, open}>, receivable: string, payable: string, possible: string}}
 */
export function offsetCandidates(documents, contactId, currency = 'EUR') {
  const mine = documents.filter(d => d.contactId === contactId);
  const probe = (amount) => ({ amount, currency });
  const receivables = candidatesFor(probe('1'), mine).sort(byDue);
  const payables = candidatesFor(probe('-1'), mine).sort(byDue);
  const receivable = total(receivables);
  const payable = total(payables);
  return { receivables, payables, receivable, payable, possible: cmp(receivable, payable) < 0 ? receivable : payable };
}

// Spreads an amount over documents in order, never above what is open on one.
function spread(amount, list) {
  let left = round(amount, 2);
  const out = [];
  for (const c of list) {
    if (cmp(left, '0') <= 0) break;
    const part = cmp(left, c.open) < 0 ? left : c.open;
    out.push({ docId: c.doc.id, amount: round(part, 2) });
    left = round(sub(left, part), 2);
  }
  return out;
}

/**
 * Offset of the chosen documents (all open ones of the contact when no
 * ids are given) up to `amount` or the largest possible amount.
 * @returns {{amount: string, currency: string, receivables: Array<{docId, amount}>, payables: Array<{docId, amount}>}}
 */
export function planOffset(documents, { contactId, currency = 'EUR', receivableIds = null, payableIds = null, amount = null }) {
  const c = offsetCandidates(documents, contactId, currency);
  const pick = (list, ids) => (ids ? list.filter(x => ids.includes(x.doc.id)) : list);
  const receivables = pick(c.receivables, receivableIds);
  const payables = pick(c.payables, payableIds);
  const max = [total(receivables), total(payables)].sort((a, b) => cmp(a, b))[0];
  const value = amount ? round(amount, 2) : max;
  if (!receivables.length || !payables.length || isZero(max)) throw new CoreError('OFFSET_NOTHING', 'both sides need an open document');
  if (cmp(value, '0') <= 0 || cmp(value, max) > 0) throw new CoreError('OFFSET_AMOUNT_INVALID', `offset ${value} outside 0..${max}`);
  return { amount: value, currency, receivables: spread(value, receivables), payables: spread(value, payables) };
}

/**
 * The protocol document and the payment patches of an offset.
 * @param {{plan: object, date: string, contact: {id: string, name: string}, taken?: string[], counters?: object, id?: string}} input
 * @returns {{protocol: object, documents: Array<{id: string, patch: object}>, counters: object}}
 */
export function buildOffset(documents, input) {
  const { plan, date, contact } = input;
  const id = input.id || uuidv7();
  const series = { ...OFFSET_SERIES, counters: input.counters || {} };
  const { number, counterKey, nextCounter } = nextNumber(series, { date, taken: input.taken || [] });
  const byId = new Map(documents.map(d => [d.id, d]));
  const patches = [...plan.receivables, ...plan.payables].map(a => {
    const doc = byId.get(a.docId);
    const payment = { ...makePayment(doc, { date, amount: a.amount, currency: plan.currency, method: 'OFFSET', source: 'MANUAL', note: number }), offsetId: id };
    return { id: doc.id, patch: addPayment(doc, payment) };
  });
  const protocol = {
    id, kind: 'INTERNAL', status: 'ISSUED', number, issueDate: date, currency: plan.currency, contactId: contact.id,
    buyer: { contactId: contact.id, name: contact.name || '' }, lines: [], payments: [],
    offset: { amount: plan.amount, receivables: plan.receivables, payables: plan.payables }
  };
  return { protocol, documents: patches, counters: { ...series.counters, [counterKey]: nextCounter } };
}

/** Patches that take the payments of a cancelled offset off its documents. */
export function cancelOffset(offsetId, documents) {
  return documents
    .filter(d => (d.payments || []).some(p => p.offsetId === offsetId))
    .map(d => ({ id: d.id, patch: removePayments(d, p => p.offsetId === offsetId) }));
}
