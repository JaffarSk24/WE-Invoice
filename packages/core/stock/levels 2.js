// Stock levels (03-features.md § 3.4): quantity on hand per item and
// warehouse on a date, the warnings for a balance that would go below
// zero and for items under their minimum. A negative balance is allowed
// (goods are sometimes sold before the receipt is typed in) but always
// shown as a warning.
import { add, cmp } from '../money/index.js';
import { moveDeltas, sortStockMoves } from './moves.js';

const key = (itemId, warehouseId) => `${itemId}\u0000${warehouseId}`;

/**
 * Quantity on hand per item and warehouse.
 * @param {Array<object>} moves  stored moves (tombstones are skipped)
 * @param {{date?: string|null, warehouseId?: string|null, itemId?: string|null, keepZero?: boolean}} [ctx]
 *   date: balances at the end of that calendar day; keepZero: also list
 *   pairs whose balance came back to zero
 * @returns {Array<{itemId: string, warehouseId: string, qty: string}>}
 */
export function stockLevels(moves, ctx = {}) {
  const { date = null, warehouseId = null, itemId = null, keepZero = false } = ctx || {};
  const totals = new Map();
  for (const move of moves || []) {
    if (!move || move.deleted) continue;
    if (date && move.date > date) continue;
    if (itemId && move.itemId !== itemId) continue;
    for (const delta of moveDeltas(move)) {
      if (warehouseId && delta.warehouseId !== warehouseId) continue;
      const k = key(move.itemId, delta.warehouseId);
      const entry = totals.get(k);
      if (entry) entry.qty = add(entry.qty, delta.qty);
      else totals.set(k, { itemId: move.itemId, warehouseId: delta.warehouseId, qty: delta.qty });
    }
  }
  const rows = [...totals.values()];
  return keepZero ? rows : rows.filter(r => cmp(r.qty, '0') !== 0);
}

/**
 * Quantity of one item on hand, in one warehouse or in all of them.
 * @returns {string}
 */
export function stockOnHand(moves, itemId, { warehouseId = null, date = null } = {}) {
  let qty = '0';
  for (const row of stockLevels(moves, { itemId, warehouseId, date, keepZero: true })) qty = add(qty, row.qty);
  return qty;
}

/**
 * Totals per item over all warehouses, from the rows of stockLevels.
 * @returns {Map<string, string>} itemId -> qty
 */
export function levelsByItem(levels) {
  const map = new Map();
  for (const row of levels || []) map.set(row.itemId, add(map.get(row.itemId) || '0', row.qty));
  return map;
}

/**
 * Item and warehouse pairs whose balance goes below zero once the new
 * moves are added. A backdated issue is checked against the balances of
 * its day too, so a sale entered before the receipt still warns.
 * @param {Array<object>} moves  existing moves
 * @param {Array<object>} added  moves about to be stored
 * @returns {Array<{itemId: string, warehouseId: string, qty: string, date: string}>}
 *   the lowest balance reached and the day it was reached
 */
export function negativeStockWarnings(moves, added) {
  const pairs = new Set();
  for (const move of added || []) for (const d of moveDeltas(move)) pairs.add(key(move.itemId, d.warehouseId));
  if (!pairs.size) return [];
  const items = new Set((added || []).map(m => m.itemId));
  const all = sortStockMoves([...(moves || []).filter(m => items.has(m.itemId)), ...added]);
  const running = new Map();
  const lowest = new Map();
  all.forEach((move, i) => {
    for (const d of moveDeltas(move)) {
      const k = key(move.itemId, d.warehouseId);
      if (pairs.has(k)) running.set(k, add(running.get(k) || '0', d.qty));
    }
    // A balance counts at the end of a day: later moves of the same day may still cover it.
    const next = all[i + 1];
    if (next && next.date === move.date) return;
    for (const [k, qty] of running) {
      const low = lowest.get(k);
      if (cmp(qty, '0') >= 0 || (low && cmp(qty, low.qty) >= 0)) continue;
      const [itemId, warehouseId] = k.split('\u0000');
      lowest.set(k, { itemId, warehouseId, qty, date: move.date });
    }
  });
  return [...lowest.values()];
}

/**
 * Stock-tracked items whose quantity over all warehouses is below their
 * minimum (minStock).
 * @param {Array<object>} items
 * @param {Array<object>} levels  rows of stockLevels
 * @returns {Array<{itemId: string, qty: string, minStock: string}>}
 */
export function lowStockItems(items, levels) {
  const byItem = levelsByItem(levels);
  return (items || [])
    .filter(item => item && !item.deleted && item.stockTracked && item.minStock !== null && item.minStock !== undefined && item.minStock !== '')
    .map(item => ({ itemId: item.id, qty: byItem.get(item.id) || '0', minStock: String(item.minStock) }))
    .filter(row => cmp(row.qty, row.minStock) < 0);
}
