// Prices for a client (03-features.md § 3.4): price levels such as
// "Veľkoobchod", the client's own prices and discounts by quantity. The
// document editor asks priceFor() for the price of a line; the result keeps
// the list price type (with or without VAT) of the item.
//
// Where the data lives (fields beyond the schema are kept by every client):
//   item.price, item.priceType          list price
//   item.prices[priceLevelId]           price of the item on a level
//   item.qtyBreaks [{minQty, discountPct}]   quantity discounts of the item
//   priceLevel.discountPct              level discount off the list price
//   priceLevel.qtyBreaks [{minQty, discountPct}]  quantity discounts of the level
//   priceLevel.validFrom / validTo      optional validity of the level
//   contact.priceLevelId                the client's level
//   contact.prices[itemId]              the client's own price (final)
import { CoreError } from '../errors.js';
import { sub, mul, div, cmp, round } from '../money/index.js';

const DECIMAL = /^-?\d+(\.\d+)?$/;
const isAmount = (v) => v !== null && v !== undefined && DECIMAL.test(String(v).trim());

function levelValid(level, date) {
  if (!level || level.deleted) return false;
  if (!date) return true;
  if (level.validFrom && date < level.validFrom) return false;
  if (level.validTo && date > level.validTo) return false;
  return true;
}

function bestBreak(breaks, qty) {
  let best = null;
  for (const b of Array.isArray(breaks) ? breaks : []) {
    if (!b || !isAmount(b.minQty) || !isAmount(b.discountPct)) continue;
    if (cmp(qty, b.minQty) < 0) continue;
    if (!best || cmp(b.discountPct, best) > 0) best = String(b.discountPct);
  }
  return best;
}

const discounted = (price, pct) => round(mul(price, sub('1', div(pct, '100', 10))), 4);

/**
 * Price of an item for a client and a quantity on a date.
 * @param {object} item
 * @param {object|null} contact  null for a sale without a client
 * @param {string} [qty='1']
 * @param {string|null} [date]  YYYY-MM-DD, for the validity of price levels
 * @param {{priceLevels?: Array<object>}} [ctx]
 * @returns {{unitPrice: string, priceType: string, discountPct: string|null, netUnitPrice: string,
 *   source: 'list'|'level'|'contact', priceLevelId: string|null}}
 *   unitPrice: the price before the quantity discount; discountPct: the
 *   quantity discount for the line; netUnitPrice: after that discount
 */
export function priceFor(item, contact = null, qty = '1', date = null, ctx = {}) {
  if (!item || !isAmount(item.price)) throw new CoreError('ITEM_PRICE_INVALID', `item ${item?.id} has no price`);
  const quantity = isAmount(qty) ? String(qty) : '1';
  let unitPrice = String(item.price);
  let source = 'list';
  let level = null;
  const levelId = contact?.priceLevelId || null;
  if (levelId) {
    const found = (ctx.priceLevels || []).find(l => l.id === levelId) || null;
    if (levelValid(found, date)) level = found;
  }
  if (level) {
    const own = item.prices?.[level.id];
    if (isAmount(own)) { unitPrice = String(own); source = 'level'; }
    else if (isAmount(level.discountPct) && cmp(level.discountPct, '0') !== 0) { unitPrice = discounted(unitPrice, level.discountPct); source = 'level'; }
  }
  const individual = contact?.prices?.[item.id];
  if (isAmount(individual)) { unitPrice = String(individual); source = 'contact'; }

  // The client's own price is agreed as final; otherwise the better of the
  // item's and the level's quantity discounts applies.
  let discountPct = null;
  if (source !== 'contact') {
    const a = bestBreak(item.qtyBreaks, quantity);
    const b = level ? bestBreak(level.qtyBreaks, quantity) : null;
    discountPct = a && b ? (cmp(a, b) >= 0 ? a : b) : (a || b);
  }
  return {
    unitPrice,
    priceType: item.priceType || 'NET',
    discountPct,
    netUnitPrice: discountPct ? discounted(unitPrice, discountPct) : unitPrice,
    source,
    priceLevelId: level ? level.id : null
  };
}
