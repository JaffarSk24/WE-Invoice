// Valuation of stock (03-features.md § 3.4): the cost of each move and the
// value of what is on hand, by weighted average cost (the default) or by
// FIFO, the two methods § 25 ods. 1 zákona o účtovníctve allows for
// interchangeable goods. Valuation is per item over all warehouses: a
// transfer between warehouses moves quantity, not value.
//
// Rules shared by both methods:
//   - a receipt without a unit cost comes in at the current cost;
//   - an issue beyond what is on hand (negative stock) is costed at the
//     last known cost; the next receipt covers the shortfall first;
//   - unit costs keep 4 decimal places, values 2.
import { CoreError } from '../errors.js';
import { add, sub, mul, div, cmp, round, isZero, abs } from '../money/index.js';
import { companyDelta, sortStockMoves } from './moves.js';

export const VALUATION_METHODS = Object.freeze(['AVERAGE', 'FIFO']);

const min = (a, b) => (cmp(a, b) <= 0 ? a : b);
const unit = (value, qty) => (isZero(qty) ? '0.0000' : round(div(value, qty, 10), 4));

// Weighted average: one pool per item.
function averagePool() {
  let qty = '0';
  let value = '0';
  let last = null;
  const current = () => (cmp(qty, '0') > 0 ? unit(value, qty) : last || '0');
  return {
    current,
    inflow(q, cost) {
      const c = cost ?? current();
      const before = qty;
      qty = add(qty, q);
      if (cmp(before, '0') <= 0) value = cmp(qty, '0') > 0 ? round(mul(qty, c), 2) : '0';
      else value = round(add(value, mul(q, c)), 2);
      last = c;
      return { unitCost: round(c, 4), value: round(mul(q, c), 2) };
    },
    outflow(q) {
      const c = current();
      let out;
      if (cmp(qty, '0') > 0 && cmp(q, qty) >= 0) {
        out = add(value, round(mul(sub(q, qty), c), 2));
        value = '0';
      } else {
        out = cmp(qty, '0') > 0 ? round(mul(q, div(value, qty, 10)), 2) : round(mul(q, c), 2);
        if (cmp(qty, '0') > 0) value = sub(value, out);
      }
      qty = sub(qty, q);
      if (cmp(qty, '0') <= 0) value = '0';
      last = c;
      return { unitCost: round(c, 4), value: round(out, 2) };
    },
    balance: () => ({ qty, value: round(value, 2) })
  };
}

// FIFO: layers of receipts, the oldest consumed first. The quantity and
// the exact value of the layers are kept as running totals, so the balance
// after a move does not add up every layer again.
function fifoPool() {
  const layers = [];
  let shortfall = '0';
  let last = null;
  let onHand = '0';
  let onHandValue = '0';
  const current = () => (layers.length ? layers[0].cost : last || '0');
  return {
    current,
    inflow(q, cost) {
      const c = cost ?? (layers.length ? layers[layers.length - 1].cost : last || '0');
      let rest = q;
      if (!isZero(shortfall)) {
        const covered = min(rest, shortfall);
        shortfall = sub(shortfall, covered);
        rest = sub(rest, covered);
      }
      if (cmp(rest, '0') > 0) {
        layers.push({ qty: rest, cost: c });
        onHand = add(onHand, rest);
        onHandValue = add(onHandValue, mul(rest, c));
      }
      last = c;
      return { unitCost: round(c, 4), value: round(mul(q, c), 2) };
    },
    outflow(q) {
      let rest = q;
      let value = '0';
      while (cmp(rest, '0') > 0 && layers.length) {
        const layer = layers[0];
        const taken = min(rest, layer.qty);
        const takenValue = mul(taken, layer.cost);
        value = add(value, takenValue);
        onHand = sub(onHand, taken);
        onHandValue = sub(onHandValue, takenValue);
        layer.qty = sub(layer.qty, taken);
        rest = sub(rest, taken);
        last = layer.cost;
        if (isZero(layer.qty)) layers.shift();
      }
      if (cmp(rest, '0') > 0) {
        value = add(value, mul(rest, last || '0'));
        shortfall = add(shortfall, rest);
      }
      return { unitCost: unit(value, q), value: round(value, 2) };
    },
    balance() {
      return { qty: sub(onHand, shortfall), value: round(onHandValue, 2) };
    }
  };
}

function pool(method) {
  if (method === 'FIFO') return fifoPool();
  if (!method || method === 'AVERAGE') return averagePool();
  throw new CoreError('STOCK_VALUATION_INVALID', `unknown valuation method ${method}`);
}

/**
 * Every move with its cost and the item's balance after it.
 * @param {Array<object>} moves
 * @param {{method?: 'AVERAGE'|'FIFO', itemId?: string|null, date?: string|null}} [options]
 * @returns {Array<object>} the moves in order, each with unitCost, value
 *   (positive, 2 places), balanceQty and balanceValue of its item
 */
export function costStockMoves(moves, { method = 'AVERAGE', itemId = null, date = null } = {}) {
  pool(method);
  const pools = new Map();
  return sortStockMoves(moves, { date, itemId }).map(move => {
    let p = pools.get(move.itemId);
    if (!p) { p = pool(method); pools.set(move.itemId, p); }
    const delta = companyDelta(move);
    let cost;
    if (isZero(delta)) cost = { unitCost: round(p.current(), 4), value: round(mul(move.qty, p.current()), 2) };
    else if (cmp(delta, '0') > 0) cost = p.inflow(delta, move.unitCost ?? null);
    else cost = p.outflow(abs(delta));
    const balance = p.balance();
    return { ...move, unitCost: cost.unitCost, value: cost.value, balanceQty: balance.qty, balanceValue: balance.value };
  });
}

/**
 * Quantity, value and unit cost of each item on a date.
 * @returns {Array<{itemId: string, qty: string, value: string, unitCost: string}>}
 */
export function stockValuation(moves, { method = 'AVERAGE', date = null } = {}) {
  const last = new Map();
  for (const move of costStockMoves(moves, { method, date })) last.set(move.itemId, move);
  return [...last.values()].map(m => ({ itemId: m.itemId, qty: m.balanceQty, value: m.balanceValue, unitCost: unit(m.balanceValue, cmp(m.balanceQty, '0') > 0 ? m.balanceQty : '0') }));
}

/**
 * Weighted average unit cost of an item at the end of a day: the cost an
 * issue on that day would take. "0" when the item never came in.
 * @param {Array<object>} moves
 * @param {string} itemId
 * @param {string|null} [date]
 * @returns {string}
 */
export function averageCost(moves, itemId, date = null) {
  const p = averagePool();
  for (const move of sortStockMoves(moves, { date, itemId })) {
    const delta = companyDelta(move);
    if (cmp(delta, '0') > 0) p.inflow(delta, move.unitCost ?? null);
    else if (cmp(delta, '0') < 0) p.outflow(abs(delta));
  }
  return round(p.current(), 4);
}
