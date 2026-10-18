// Document numbering (03-features.md § 3.5), WP-CORE. A series has a mask
// of tokens ({YYYY}, {YY}, {MM}, {N}, {N:4}) with any prefix and suffix,
// a counter per reset period (year, month or never) and an optional mask
// for the variable symbol. Numbers are assigned from the document's own
// calendar date, never from the clock, so a device in another time zone
// gets the same number.
import { CoreError } from '../errors.js';
import { dateParts } from '../documents/dates.js';

const TOKEN = /\{(YYYY|YY|MM|N)(?::(\d{1,2}))?\}/g;
const VS_MAX = 10;

/**
 * Fills a mask such as "FA{YYYY}{N:4}" for a date and a counter value.
 * {N} is the counter without padding, {N:4} padded with zeros to 4 digits
 * (a larger counter keeps all its digits). A mask without {N} cannot
 * number anything.
 * @param {string} mask
 * @param {{date: string, counter: number}} ctx
 * @returns {string}
 */
export function formatNumber(mask, ctx) {
  if (typeof mask !== 'string' || !mask.includes('{N')) throw new CoreError('SERIES_MASK_INVALID', `mask without a counter: ${mask}`);
  if (!Number.isInteger(ctx?.counter) || ctx.counter < 1) throw new CoreError('SERIES_COUNTER_INVALID', `counter must be a positive integer: ${ctx?.counter}`);
  const { year, month } = dateParts(ctx.date);
  return mask.replace(TOKEN, (_, token, width) => {
    switch (token) {
      case 'YYYY': return year;
      case 'YY': return year.slice(2);
      case 'MM': return month;
      default: return width ? String(ctx.counter).padStart(Number(width), '0') : String(ctx.counter);
    }
  });
}

/** Key of the counter a series uses for a date: "2026", "2026-10" or "all". */
export function counterKey(series, date) {
  const { year, month } = dateParts(date);
  switch (series.reset) {
    case 'YEARLY': return year;
    case 'MONTHLY': return `${year}-${month}`;
    case 'NEVER': return 'all';
    default: throw new CoreError('SERIES_RESET_INVALID', `unknown reset ${series.reset}`);
  }
}

/**
 * Next free number of a series for a date. Does not mutate the series: the
 * caller stores nextCounter under counterKey. Numbers already in use
 * (ctx.taken, e.g. after a merge or a manual counter edit) are skipped.
 * @param {import('../schema/types.js').Series} series
 * @param {{date: string, taken?: Iterable<string>}} ctx
 * @returns {{number: string, vs: string, counterKey: string, nextCounter: number}}
 */
export function nextNumber(series, ctx) {
  const key = counterKey(series, ctx.date);
  const taken = ctx.taken instanceof Set ? ctx.taken : new Set(ctx.taken || []);
  let counter = series.counters?.[key] ?? 1;
  if (!Number.isInteger(counter) || counter < 1) counter = 1;
  let number = formatNumber(series.mask, { date: ctx.date, counter });
  while (taken.has(number)) {
    counter += 1;
    number = formatNumber(series.mask, { date: ctx.date, counter });
  }
  const vs = series.vsMask ? vsFromNumber(formatNumber(series.vsMask, { date: ctx.date, counter })) : vsFromNumber(number);
  return { number, vs, counterKey: key, nextCounter: counter + 1 };
}

/**
 * Variable symbol from a document number: its digits only, at most 10.
 * When there are more, the last ten are kept, so the sequence number at
 * the end of a long mask survives.
 * @returns {string}
 */
export function vsFromNumber(number) {
  const digits = String(number ?? '').replace(/\D/g, '');
  return digits.length > VS_MAX ? digits.slice(-VS_MAX) : digits;
}

/**
 * Duplicates of seriesId + number after a merge, with the renumbering
 * proposal for unlocked documents (02-architecture.md § 2.6). Of the
 * documents sharing a number, a locked one keeps it, otherwise the one
 * created first; every other one gets the next free number of its series
 * for its issue date. Locked documents are never renumbered: a locked
 * duplicate of a locked number is reported with proposed = null.
 * @param {Array<import('../schema/types.js').Document>} documents
 * @param {Array<import('../schema/types.js').Series>} seriesList
 * @returns {Array<{docId: string, number: string, proposed: string|null, locked: boolean}>}
 */
export function findNumberConflicts(documents, seriesList) {
  const series = new Map((seriesList || []).map(s => [s.id, s]));
  const groups = new Map();
  const takenBySeries = new Map();
  for (const doc of documents || []) {
    if (doc.deleted || !doc.number || !doc.seriesId) continue;
    const key = `${doc.seriesId}::${doc.number}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
    if (!takenBySeries.has(doc.seriesId)) takenBySeries.set(doc.seriesId, new Set());
    takenBySeries.get(doc.seriesId).add(doc.number);
  }

  const conflicts = [];
  for (const docs of groups.values()) {
    if (docs.length < 2) continue;
    const ordered = [...docs].sort(byKeeperPriority);
    for (const doc of ordered.slice(1)) {
      const locked = Boolean(doc.lockedAt);
      const def = series.get(doc.seriesId);
      let proposed = null;
      if (!locked && def && doc.issueDate) {
        const taken = takenBySeries.get(doc.seriesId);
        proposed = nextNumber(def, { date: doc.issueDate, taken }).number;
        taken.add(proposed);
      }
      conflicts.push({ docId: doc.id, number: doc.number, proposed, locked });
    }
  }
  return conflicts;
}

function byKeeperPriority(a, b) {
  const lockedA = a.lockedAt ? 0 : 1;
  const lockedB = b.lockedAt ? 0 : 1;
  if (lockedA !== lockedB) return lockedA - lockedB;
  const createdA = a.createdAt || '';
  const createdB = b.createdAt || '';
  if (createdA !== createdB) return createdA < createdB ? -1 : 1;
  return String(a.id).localeCompare(String(b.id));
}
