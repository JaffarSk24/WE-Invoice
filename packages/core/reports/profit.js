// Profitability: revenue less the costs that belong to it.
//   - by item: net sales of the item less its quantity at the average
//     purchase price (from the lines of received invoices with the same
//     price list item); an item never bought has no known cost;
//   - by client: net sales less the purchase cost of the items sold to
//     the client, the same way;
//   - by project: sales of the project less the purchases of the project
//     (documents with the same projectRef).
// Everything in EUR, signed as in the sales report.
import Big from 'big.js';
import { isSaleDoc, isPurchaseDoc, counts, eurAmounts, partyOf, reportDate, signOf } from './amounts.js';
import { within } from './periods.js';
import { fastLineNet, itemKey } from './lines.js';

const ZERO = new Big(0);

function fxOf(doc) {
  if (!doc.currency || doc.currency === 'EUR' || !doc.fxRate) return null;
  const rate = new Big(doc.fxRate);
  return rate.eq(0) ? null : rate;
}

/** Average net purchase price per unit in EUR by item key, from received documents up to `to`. */
export function averagePurchasePrices(documents, to = null) {
  const sums = new Map();
  for (const doc of documents || []) {
    if (!isPurchaseDoc(doc) || !counts(doc) || signOf(doc) < 0) continue;
    const date = reportDate(doc);
    if (to && date && date > to) continue;
    const fx = fxOf(doc);
    for (const line of doc.lines || []) {
      if (!line.itemId) continue;
      const net = fastLineNet(line);
      const qty = new Big(line.qty || 0).abs();
      if (net === null || qty.eq(0)) continue;
      const value = fx ? net.abs().div(fx) : net.abs();
      const s = sums.get(line.itemId) || { qty: ZERO, net: ZERO };
      sums.set(line.itemId, { qty: s.qty.plus(qty), net: s.net.plus(value) });
    }
  }
  return new Map(Array.from(sums, ([key, s]) => [key, s.net.div(s.qty).round(4, Big.roundHalfUp)]));
}

function row(map, key, init) {
  let entry = map.get(key);
  if (!entry) {
    entry = { ...init, revenue: ZERO, cost: ZERO, costKnown: true };
    map.set(key, entry);
  }
  return entry;
}

function finish(map) {
  return Array.from(map.values()).map(r => {
    const profit = r.revenue.minus(r.cost);
    const margin = r.revenue.eq(0) ? null : profit.times(100).div(r.revenue.abs()).round(1, Big.roundHalfUp).toFixed(1);
    return { ...r, revenue: r.revenue.toFixed(2), cost: r.cost.toFixed(2), profit: profit.toFixed(2), margin };
  }).sort((a, b) => new Big(b.profit).cmp(a.profit));
}

/**
 * @param {object[]} documents
 * @param {{from?: string, to?: string}} ctx
 * @returns {{byItem: object[], byContact: object[], byProject: object[]}}
 */
export function profitability(documents, ctx = {}) {
  const { from = null, to = null } = ctx;
  const prices = averagePurchasePrices(documents, to);
  const items = new Map();
  const contacts = new Map();
  const projects = new Map();
  for (const doc of documents || []) {
    const sale = isSaleDoc(doc);
    if ((!sale && !isPurchaseDoc(doc)) || !counts(doc) || !within(reportDate(doc), from, to)) continue;
    const net = new Big(eurAmounts(doc).net);
    if (doc.projectRef) {
      const p = row(projects, doc.projectRef, { key: doc.projectRef });
      if (sale) p.revenue = p.revenue.plus(net); else p.cost = p.cost.plus(net);
    }
    if (!sale) continue;
    const party = partyOf(doc);
    const c = row(contacts, party.key, { key: party.key, id: party.id, name: party.name });
    c.revenue = c.revenue.plus(net);
    const sign = signOf(doc);
    const fx = fxOf(doc);
    for (const line of doc.lines || []) {
      const key = itemKey(line);
      const lineNet = key ? fastLineNet(line) : null;
      if (lineNet === null) continue;
      const qty = new Big(line.qty || 0).abs();
      let value = fx ? lineNet.abs().div(fx).round(2, Big.roundHalfUp) : lineNet.abs();
      if (sign < 0) value = value.neg();
      const i = row(items, key, { key, itemId: line.itemId || null, name: line.name || '' });
      i.revenue = i.revenue.plus(value);
      const price = line.itemId ? prices.get(line.itemId) : undefined;
      if (price === undefined) {
        i.costKnown = false;
        c.costKnown = false;
        continue;
      }
      const cost = price.times(qty).round(2, Big.roundHalfUp);
      const signedCost = sign < 0 ? cost.neg() : cost;
      i.cost = i.cost.plus(signedCost);
      c.cost = c.cost.plus(signedCost);
    }
  }
  return { byItem: finish(items), byContact: finish(contacts), byProject: finish(projects) };
}
