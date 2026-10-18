// Expected cash flow: money that should come in from open invoices and the
// invoices recurring templates will issue, and money that should go out
// for open received invoices, placed on the day it is expected and summed
// by month or week. A client who usually pays late is expected late: the
// average delay of their past payments shifts their open invoices.
// Overdue items are expected today (the first period).
import { add, sub, cmp, neg, round } from '../money/index.js';
import { addDays, diffDays } from '../documents/dates.js';
import { computeTotals } from '../vat/index.js';
import { isReceivableDoc, isPayableDoc, counts, eurAmounts, partyOf, toEur, fixed2 } from './amounts.js';
import { CoreError } from '../errors.js';

export const DEFAULT_DUE_DAYS = 14;
const MONTH_STEP = { MONTH: 1, QUARTER: 3, HALF_YEAR: 6, YEAR: 12 };

/** A calendar date plus whole months; the day is kept or clamped to the month end. */
export function addMonths(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const index = (y * 12) + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/** The dates a recurring template will run on from its next run up to `until`. */
export function recurringRuns(template, until) {
  if (!template || !template.active || !template.nextRun) return [];
  const interval = Math.max(1, template.interval || 1);
  const runs = [];
  const left = template.maxCount ? Math.max(0, template.maxCount - (template.generatedCount || 0)) : Infinity;
  for (let i = 0; runs.length < left && i < 600; i++) {
    let date;
    if (template.frequency === 'WEEK') date = addDays(template.nextRun, 7 * interval * i);
    else if (template.frequency === 'MONTHS') date = addMonths(template.nextRun, interval * i);
    else date = addMonths(template.nextRun, (MONTH_STEP[template.frequency] || 1) * interval * i);
    if (date > until || (template.endDate && date > template.endDate)) break;
    runs.push(date);
  }
  return runs;
}

/** Average days past the due date in which each contact has paid, by party key. */
export function paymentDelays(documents) {
  const stats = new Map();
  for (const doc of documents || []) {
    if (!isReceivableDoc(doc) || !counts(doc) || !doc.dueDate) continue;
    const dates = (doc.payments || []).filter(p => p && !p.deleted && p.date).map(p => p.date).sort();
    if (!dates.length) continue;
    const delay = Math.max(0, diffDays(doc.dueDate, dates[dates.length - 1]));
    const key = partyOf(doc).key;
    const s = stats.get(key) || { days: 0, count: 0 };
    stats.set(key, { days: s.days + delay, count: s.count + 1 });
  }
  return new Map(Array.from(stats, ([key, s]) => [key, Math.round(s.days / s.count)]));
}

function bucketsOf(today, until, granularity) {
  const buckets = [];
  let from = today;
  while (from <= until && buckets.length < 600) {
    const to = granularity === 'week' ? addDays(from, 6) : addDays(addMonths(`${from.slice(0, 7)}-01`, 1), -1);
    buckets.push({ key: granularity === 'week' ? from : from.slice(0, 7), from, to: to > until ? until : to, inflow: '0', outflow: '0', net: '0', balance: '0', count: 0 });
    from = addDays(to, 1);
  }
  return buckets;
}

/**
 * @param {{documents?: object[], recurringTemplates?: object[]}} data
 * @param {{today: string, months?: number, granularity?: 'month'|'week', openingBalance?: string, useDelays?: boolean}} ctx
 * @returns {{today: string, until: string, buckets: object[], items: object[], inflow: string, outflow: string, net: string, overdueIn: string, overdueOut: string}}
 */
export function cashflowForecast(data = {}, ctx = {}) {
  const { today, months = 6, granularity = 'month', openingBalance = '0', useDelays = true } = ctx;
  if (!today || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new CoreError('DATE_INVALID', 'cashflowForecast needs the local date');
  const until = addDays(addMonths(today, months), -1);
  const documents = data.documents || [];
  const delays = useDelays ? paymentDelays(documents) : new Map();
  const items = [];
  let overdueIn = '0';
  let overdueOut = '0';

  for (const doc of documents) {
    const incoming = isReceivableDoc(doc);
    if ((!incoming && !isPayableDoc(doc)) || !counts(doc)) continue;
    const { due } = eurAmounts(doc);
    if (cmp(due, '0') <= 0) continue;
    const party = partyOf(doc);
    const dueDate = doc.dueDate || doc.issueDate || today;
    const expected = incoming ? addDays(dueDate, delays.get(party.key) || 0) : dueDate;
    if (dueDate < today) {
      if (incoming) overdueIn = add(overdueIn, due); else overdueOut = add(overdueOut, due);
    }
    items.push({ source: incoming ? 'receivable' : 'payable', id: doc.id, number: doc.number || '', name: party.name, dueDate, date: expected < today ? today : expected, amount: incoming ? due : neg(due) });
  }

  for (const template of data.recurringTemplates || []) {
    if (!template || template.deleted) continue;
    const doc = { currency: 'EUR', ...(template.docTemplate || {}) };
    let gross;
    try {
      gross = computeTotals(doc).gross;
    } catch (e) {
      console.warn(`Recurring template ${template.id} cannot be priced for the forecast`, e);
      continue;
    }
    const amount = toEur(gross, doc).amount;
    if (cmp(amount, '0') <= 0) continue;
    const party = partyOf(doc);
    const shift = (template.dueShiftDays ?? DEFAULT_DUE_DAYS) + (delays.get(party.key) || 0);
    for (const run of recurringRuns(template, until)) {
      const date = addDays(run, shift);
      if (date > until) break;
      items.push({ source: 'recurring', id: template.id, number: '', name: template.name || party.name, dueDate: date, date: date < today ? today : date, amount });
    }
  }

  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const buckets = bucketsOf(today, until, granularity);
  let inflow = '0';
  let outflow = '0';
  let b = 0;
  for (const item of items) {
    if (item.date > until) continue;
    while (b < buckets.length - 1 && item.date > buckets[b].to) b += 1;
    const bucket = buckets[b];
    if (cmp(item.amount, '0') >= 0) {
      bucket.inflow = add(bucket.inflow, item.amount);
      inflow = add(inflow, item.amount);
    } else {
      bucket.outflow = add(bucket.outflow, neg(item.amount));
      outflow = add(outflow, neg(item.amount));
    }
    bucket.count += 1;
  }
  let balance = round(openingBalance || '0', 2);
  for (const bucket of buckets) {
    bucket.net = sub(bucket.inflow, bucket.outflow);
    balance = add(balance, bucket.net);
    bucket.balance = balance;
  }
  fixed2(buckets, ['inflow', 'outflow', 'net', 'balance']);
  const [sums] = fixed2([{ inflow, outflow, net: sub(inflow, outflow), overdueIn, overdueOut }], ['inflow', 'outflow', 'net', 'overdueIn', 'overdueOut']);
  return { today, until, buckets, items: items.filter(i => i.date <= until), ...sums };
}
