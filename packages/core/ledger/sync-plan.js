// Keeps the automatic ledger entries in line with the payments recorded on
// documents. A pure plan: what to insert, update and remove, plus warnings
// the screens show (an expense without a category, a set-off, a bank line
// without a document). Entries the user wrote or edited (auto: false) are
// never touched, and a payment that has one is not booked again.
import { cmp } from '../money/index.js';
import { CoreError } from '../errors.js';
import { entriesForPayment, paymentDirection } from './payment-entries.js';

const COMPARED = ['date', 'number', 'direction', 'medium', 'amount', 'vat', 'category', 'taxRelevant', 'docId', 'text'];
const key = (e) => `${e.paymentId}|${e.category}`;
const live = (r) => r && !r.deleted;

function changed(current, wanted) {
  const patch = {};
  for (const field of COMPARED) {
    if ((current[field] ?? null) !== (wanted[field] ?? null)) patch[field] = wanted[field];
  }
  return Object.keys(patch).length ? patch : null;
}

// An id not yet used by any record, tombstones included (a deleted id can
// never be inserted again).
function freeId(base, taken) {
  if (!taken.has(base)) return base;
  let n = 1;
  while (taken.has(`${base}~${n}`)) n += 1;
  return `${base}~${n}`;
}

/**
 * Plans the automatic entries of all payments.
 * @param {{documents: object[], entries: object[], company: object, bankTransactions?: object[]}} input
 *   entries may include tombstones; documents and transactions are the live ones
 * @returns {{insert: object[], update: {id: string, patch: object}[], remove: string[], warnings: object[]}}
 */
export function planEntrySync({ documents = [], entries = [], company, bankTransactions = [] }) {
  const warnings = [];
  const manualPayments = new Set(entries.filter(e => live(e) && !e.auto && e.paymentId).map(e => e.paymentId));
  const wanted = new Map();
  for (const document of documents.filter(live)) {
    if (document.status === 'DRAFT' || document.status === 'CANCELLED' || !paymentDirection(document)) continue;
    for (const payment of (document.payments || []).filter(live)) {
      if (manualPayments.has(payment.id)) continue;
      if (payment.method === 'OFFSET') { warnings.push({ code: 'PAYMENT_OFFSET', docId: document.id, paymentId: payment.id }); continue; }
      let made;
      try {
        made = entriesForPayment(document, payment, company);
      } catch (e) {
        if (!(e instanceof CoreError)) throw e;
        warnings.push({ code: e.code, docId: document.id, paymentId: payment.id });
        continue;
      }
      made.forEach(entry => {
        if (entry.category === 'EXPENSE_UNCATEGORIZED') warnings.push({ code: 'EXPENSE_UNCATEGORIZED', docId: document.id, paymentId: payment.id });
        wanted.set(key(entry), entry);
      });
    }
  }
  const taken = new Set(entries.map(e => e.id));
  const existing = new Map(entries.filter(e => live(e) && e.auto).map(e => [key(e), e]));
  const insert = [];
  const update = [];
  const remove = [];
  for (const [k, entry] of wanted) {
    const current = existing.get(k);
    if (!current) {
      const id = freeId(entry.id, taken);
      taken.add(id);
      insert.push({ ...entry, id });
      continue;
    }
    const patch = changed(current, entry);
    if (patch) update.push({ id: current.id, patch });
  }
  for (const [k, current] of existing) if (!wanted.has(k)) remove.push(current.id);
  warnings.push(...bankWarnings(bankTransactions, entries));
  return { insert, update, remove, warnings };
}

// A bank line not matched to a document and not booked by hand (same
// date and amount on the bank column) is "a payment without a document".
function bankWarnings(transactions, entries) {
  const manual = entries.filter(e => live(e) && !e.auto && e.medium === 'BANK');
  return transactions.filter(live).filter(tx => !tx.matched?.docId).filter(tx => !manual.some(e => e.date === tx.date
    && cmp(e.amount, tx.amount.replace(/^-/, '')) === 0)).map(tx => ({ code: 'PAYMENT_WITHOUT_DOCUMENT', bankTxId: tx.id, date: tx.date, amount: tx.amount }));
}
