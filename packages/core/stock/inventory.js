// Stocktaking (inventúra, 03-features.md § 3.4): the counted quantities of
// a warehouse are compared with the book balance on the count date and
// every difference becomes an ADJUSTMENT move. Items that were not counted
// are left as they are; counting zero is an explicit choice.
import { CoreError } from '../errors.js';
import { sub, cmp, isZero } from '../money/index.js';
import { stockLevels } from './levels.js';

const DECIMAL = /^\d+(\.\d+)?$/;

/**
 * Differences between counted and book quantities.
 * @param {Array<object>} moves  existing moves
 * @param {{warehouseId: string, date: string, counts: Record<string, string>, note?: string|null}} input
 *   counts: itemId -> counted quantity (not negative)
 * @returns {Array<{itemId: string, book: string, counted: string, difference: string, move: object|null}>}
 *   one row per counted item; move is the ADJUSTMENT to store, null when nothing differs
 */
export function inventoryDifferences(moves, { warehouseId, date, counts, note = null }) {
  if (!warehouseId) throw new CoreError('STOCK_MOVE_INVALID', 'stocktaking needs a warehouse', { field: 'warehouseId' });
  if (!date) throw new CoreError('STOCK_MOVE_INVALID', 'stocktaking needs a date', { field: 'date' });
  const book = new Map(stockLevels(moves, { warehouseId, date, keepZero: true }).map(r => [r.itemId, r.qty]));
  return Object.entries(counts || {}).map(([itemId, raw]) => {
    const counted = String(raw ?? '').trim();
    if (!DECIMAL.test(counted)) throw new CoreError('STOCK_COUNT_INVALID', `not a counted quantity: ${raw}`, { itemId });
    const bookQty = book.get(itemId) || '0';
    const difference = sub(counted, bookQty);
    const move = isZero(difference) ? null : {
      kind: 'ADJUSTMENT', date, warehouseId, targetWarehouseId: null, itemId, qty: difference, unitCost: null, docId: null, note
    };
    return { itemId, book: bookQty, counted, difference, move };
  });
}

/** True when a stocktaking found a shortage (some difference below zero). */
export function hasShortage(rows) {
  return (rows || []).some(r => cmp(r.difference, '0') < 0);
}
