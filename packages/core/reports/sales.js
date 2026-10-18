// Sales and purchases by period, client (or supplier), item, label and
// project, with the same periods of the year before. One pass over the
// documents fills every grouping, so the report of 10 000 documents takes
// a few dozen milliseconds. Amounts are signed (credit notes lower the
// totals) and in EUR; documents in another currency without a rate are
// counted as they are and reported in `unconverted`.
import Big from 'big.js';
import { add, cmp, sub, div, mul, round, isZero } from '../money/index.js';
import { isSaleDoc, isPurchaseDoc, counts, eurAmounts, partyOf, reportDate, signOf, bump, byAmountDesc, fixed2 } from './amounts.js';
import { periodKey, periodKeys, previousYearKey, shiftYear, within } from './periods.js';
import { fastLineNet, itemKey } from './lines.js';
import { CoreError } from '../errors.js';

export const DIRECTIONS = Object.freeze(['sales', 'purchases']);
const NO_PROJECT = '';

function matches(doc, ctx) {
  if (ctx.label && !(doc.tags || []).includes(ctx.label)) return false;
  if (ctx.project !== undefined && ctx.project !== null && (doc.projectRef || NO_PROJECT) !== ctx.project) return false;
  if (ctx.contactId && partyOf(doc).key !== ctx.contactId) return false;
  return true;
}

/** Percentage change from `before` to `now`, one decimal; null when before is zero. */
export function changePct(now, before) {
  if (isZero(before)) return null;
  return round(div(mul(sub(now, before), '100'), before.startsWith('-') ? before.slice(1) : before, 6), 1);
}

function lineRows(doc, sign, items, fx) {
  for (const line of doc.lines || []) {
    const key = itemKey(line);
    if (!key) continue;
    const net = fastLineNet(line);
    if (net === null) continue;
    let value = sign < 0 ? net.abs().neg() : net.abs();
    if (fx) value = value.div(fx).round(2, Big.roundHalfUp);
    let entry = items.get(key);
    if (!entry) {
      entry = { key, itemId: line.itemId || null, name: line.name || '', unit: (line.unit && (line.unit.label || line.unit.code)) || '', qty: new Big(0), net: new Big(0), count: 0 };
      items.set(key, entry);
    }
    const qty = new Big(line.qty || 0).abs();
    entry.qty = sign < 0 ? entry.qty.minus(qty) : entry.qty.plus(qty);
    entry.net = entry.net.plus(value);
    entry.count += 1;
  }
}

/**
 * The sales (or purchases) report of a period.
 * @param {object[]} documents  documents of the store (any kind; others are skipped)
 * @param {{from: string, to: string, granularity?: 'month'|'quarter'|'year',
 *   direction?: 'sales'|'purchases', label?: string, project?: string, contactId?: string,
 *   items?: boolean}} ctx
 */
export function salesReport(documents, ctx = {}) {
  const { from = null, to = null, granularity = 'month', direction = 'sales', items: withItems = true } = ctx;
  if (!DIRECTIONS.includes(direction)) throw new CoreError('REPORT_DIRECTION_INVALID', `unknown direction ${direction}`);
  const wanted = direction === 'sales' ? isSaleDoc : isPurchaseDoc;
  const prevFrom = from ? shiftYear(from) : null;
  const prevTo = to ? shiftYear(to) : null;

  const periods = new Map();
  const contacts = new Map();
  const labels = new Map();
  const projects = new Map();
  const items = new Map();
  const total = { net: '0', vat: '0', gross: '0', count: 0 };
  const previous = { net: '0', gross: '0', count: 0 };
  let unconverted = 0;
  let firstDate = null;
  let lastDate = null;

  for (const doc of documents || []) {
    if (!wanted(doc) || !counts(doc) || !matches(doc, ctx)) continue;
    const date = reportDate(doc);
    if (!date) continue;
    const current = within(date, from, to);
    const before = !current && within(date, prevFrom, prevTo);
    if (!current && !before) continue;
    const amounts = eurAmounts(doc);
    const key = periodKey(date, granularity);
    bump(periods, key, () => ({ key, net: '0', gross: '0', count: 0 }), { net: amounts.net, gross: amounts.gross, count: 1 });
    if (before) {
      previous.net = add(previous.net, amounts.net);
      previous.gross = add(previous.gross, amounts.gross);
      previous.count += 1;
      continue;
    }
    if (!amounts.converted) unconverted += 1;
    if (!firstDate || date < firstDate) firstDate = date;
    if (!lastDate || date > lastDate) lastDate = date;
    total.net = add(total.net, amounts.net);
    total.vat = add(total.vat, amounts.vat);
    total.gross = add(total.gross, amounts.gross);
    total.count += 1;
    const party = partyOf(doc);
    bump(contacts, party.key, () => ({ key: party.key, id: party.id, name: party.name, net: '0', gross: '0', count: 0 }), { net: amounts.net, gross: amounts.gross, count: 1 });
    for (const label of new Set(doc.tags || [])) bump(labels, label, () => ({ key: label, net: '0', gross: '0', count: 0 }), { net: amounts.net, gross: amounts.gross, count: 1 });
    const project = doc.projectRef || NO_PROJECT;
    bump(projects, project, () => ({ key: project, net: '0', gross: '0', count: 0 }), { net: amounts.net, gross: amounts.gross, count: 1 });
    if (withItems) {
      const fx = doc.currency && doc.currency !== 'EUR' && doc.fxRate && !isZero(doc.fxRate) ? new Big(doc.fxRate) : null;
      lineRows(doc, signOf(doc), items, fx);
    }
  }

  const keys = periodKeys(from || firstDate, to || lastDate, granularity);
  const byPeriod = keys.map(key => {
    const row = periods.get(key) || { net: '0', gross: '0', count: 0 };
    const prev = periods.get(previousYearKey(key)) || { net: '0', gross: '0', count: 0 };
    return { key, net: row.net, gross: row.gross, count: row.count, prevNet: prev.net, prevGross: prev.gross, change: changePct(row.net, prev.net) };
  });
  fixed2(byPeriod, ['net', 'gross', 'prevNet', 'prevGross']);
  fixed2([total], ['net', 'vat', 'gross']);
  fixed2([previous], ['net', 'gross']);
  const rows = (map) => fixed2(Array.from(map.values()), ['net', 'gross']).sort(byAmountDesc('net'));
  const byItem = Array.from(items.values())
    .map(r => ({ ...r, qty: r.qty.toFixed(), net: r.net.toFixed(2) }))
    .sort(byAmountDesc('net'));
  return {
    direction, from, to, granularity, total, previous, change: changePct(total.net, previous.net), unconverted,
    byPeriod,
    byContact: rows(contacts),
    byItem,
    byLabel: rows(labels),
    byProject: rows(projects).filter(r => r.key !== NO_PROJECT || cmp(r.net, '0') !== 0)
  };
}
