// Receivables (pohľadávky) and payables (záväzky) by age: what is still to
// be paid on issued and received invoices, split by how many days past the
// due date it is on the local calendar date `today`: not yet due, 1-15,
// 16-30, 31-60 and more than 60 days. A document without a due date is
// counted as due on its issue date.
import { add, cmp } from '../money/index.js';
import { diffDays } from '../documents/dates.js';
import { isReceivableDoc, isPayableDoc, counts, eurAmounts, partyOf, byAmountDesc, fixed2 } from './amounts.js';
import { CoreError } from '../errors.js';

export const AGING_BUCKETS = Object.freeze(['current', 'd1to15', 'd16to30', 'd31to60', 'd60plus']);

/** The bucket of a due date on a day; `current` when not yet overdue. */
export function agingBucket(dueDate, today) {
  const days = diffDays(dueDate, today);
  if (days <= 0) return 'current';
  if (days <= 15) return 'd1to15';
  if (days <= 30) return 'd16to30';
  if (days <= 60) return 'd31to60';
  return 'd60plus';
}

function emptyBuckets() {
  return Object.fromEntries(AGING_BUCKETS.map(b => [b, '0']));
}

function side(documents, today, wanted) {
  const contacts = new Map();
  const buckets = emptyBuckets();
  const counts_ = Object.fromEntries(AGING_BUCKETS.map(b => [b, 0]));
  const rows = [];
  let total = '0';
  let overdue = '0';
  for (const doc of documents || []) {
    if (!wanted(doc) || !counts(doc)) continue;
    const { due } = eurAmounts(doc);
    if (cmp(due, '0') <= 0) continue;
    const dueDate = doc.dueDate || doc.issueDate || doc.receivedDate;
    if (!dueDate) continue;
    const bucket = agingBucket(dueDate, today);
    const days = Math.max(0, diffDays(dueDate, today));
    const party = partyOf(doc);
    buckets[bucket] = add(buckets[bucket], due);
    counts_[bucket] += 1;
    total = add(total, due);
    if (bucket !== 'current') overdue = add(overdue, due);
    let entry = contacts.get(party.key);
    if (!entry) {
      entry = { key: party.key, id: party.id, name: party.name, total: '0', count: 0, maxDays: 0, ...emptyBuckets() };
      contacts.set(party.key, entry);
    }
    entry[bucket] = add(entry[bucket], due);
    entry.total = add(entry.total, due);
    entry.count += 1;
    entry.maxDays = Math.max(entry.maxDays, days);
    rows.push({ id: doc.id, kind: doc.kind, number: doc.number || '', contactKey: party.key, name: party.name, dueDate, days, bucket, due, currency: doc.currency || 'EUR' });
  }
  rows.sort((a, b) => b.days - a.days || cmp(b.due, a.due));
  const byContact = fixed2(Array.from(contacts.values()), ['total', ...AGING_BUCKETS]).sort(byAmountDesc('total'));
  const [sums] = fixed2([{ total, overdue, ...buckets }], ['total', 'overdue', ...AGING_BUCKETS]);
  const { total: t, overdue: o, ...b } = sums;
  return { total: t, overdue: o, buckets: b, counts: counts_, byContact, documents: rows };
}

/**
 * @param {object[]} documents
 * @param {string} today  local calendar date (YYYY-MM-DD)
 * @returns {{today: string, receivables: object, payables: object}}
 */
export function agingReport(documents, today) {
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new CoreError('DATE_INVALID', 'agingReport needs the local date');
  return { today, receivables: side(documents, today, isReceivableDoc), payables: side(documents, today, isPayableDoc) };
}
