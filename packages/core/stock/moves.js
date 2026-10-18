// Stock moves (03-features.md § 3.4): what a move means for the quantity
// in each warehouse, how moves are validated and in which order they are
// applied. Kept apart from levels and valuation so both read moves the
// same way.
//
// Conventions of a stored move (schema StockMove):
//   RECEIPT     qty > 0, adds to warehouseId (príjemka, return from a buyer)
//   ISSUE       qty > 0, takes from warehouseId (výdajka, sale)
//   TRANSFER    qty > 0, from warehouseId to targetWarehouseId (prevodka)
//   ADJUSTMENT  qty signed, inventory difference in warehouseId
import { CoreError } from '../errors.js';
import { cmp, isZero, neg } from '../money/index.js';
import { STOCK_MOVE_KINDS } from '../schema/enums.js';

const DECIMAL = /^-?\d+(\.\d+)?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const invalid = (field, message) => new CoreError('STOCK_MOVE_INVALID', message, { field });

/**
 * Checks a move before it is stored and returns it with defaults filled.
 * Throws CoreError STOCK_MOVE_INVALID with details.field naming the field.
 * @param {object} fields
 * @returns {object}
 */
export function normalizeStockMove(fields) {
  const move = { targetWarehouseId: null, unitCost: null, docId: null, note: null, ...fields };
  if (!STOCK_MOVE_KINDS.includes(move.kind)) throw invalid('kind', `unknown move kind ${move.kind}`);
  if (typeof move.date !== 'string' || !DATE.test(move.date)) throw invalid('date', `not a calendar date: ${move.date}`);
  if (!move.warehouseId) throw invalid('warehouseId', 'a move needs a warehouse');
  if (!move.itemId) throw invalid('itemId', 'a move needs an item');
  const qty = String(move.qty ?? '').trim();
  if (!DECIMAL.test(qty)) throw invalid('qty', `not a quantity: ${move.qty}`);
  if (isZero(qty)) throw invalid('qty', 'quantity is zero');
  if (move.kind !== 'ADJUSTMENT' && cmp(qty, '0') < 0) throw invalid('qty', `${move.kind} needs a positive quantity`);
  move.qty = qty;
  if (move.kind === 'TRANSFER') {
    if (!move.targetWarehouseId) throw invalid('targetWarehouseId', 'a transfer needs a target warehouse');
    if (move.targetWarehouseId === move.warehouseId) throw invalid('targetWarehouseId', 'a transfer needs two different warehouses');
  } else {
    move.targetWarehouseId = null;
  }
  if (move.unitCost !== null && move.unitCost !== undefined && move.unitCost !== '') {
    const cost = String(move.unitCost).trim();
    if (!DECIMAL.test(cost) || cmp(cost, '0') < 0) throw invalid('unitCost', `not a unit cost: ${move.unitCost}`);
    move.unitCost = cost;
  } else {
    move.unitCost = null;
  }
  return move;
}

/**
 * Quantity changes a move makes, per warehouse.
 * @returns {Array<{warehouseId: string, qty: string}>}
 */
export function moveDeltas(move) {
  switch (move.kind) {
    case 'RECEIPT':
    case 'ADJUSTMENT':
      return [{ warehouseId: move.warehouseId, qty: move.qty }];
    case 'ISSUE':
      return [{ warehouseId: move.warehouseId, qty: neg(move.qty) }];
    case 'TRANSFER':
      return [{ warehouseId: move.warehouseId, qty: neg(move.qty) }, { warehouseId: move.targetWarehouseId, qty: move.qty }];
    default:
      return [];
  }
}

/**
 * Change of the company-wide quantity of the item (a transfer changes
 * nothing). Used by valuation, which is per item across warehouses.
 * @returns {string}
 */
export function companyDelta(move) {
  if (move.kind === 'ISSUE') return neg(move.qty);
  if (move.kind === 'TRANSFER') return '0';
  return move.qty;
}

// Order in which moves apply: calendar date, then the time they were
// recorded, then id, so two devices compute the same balances.
function compareMoves(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ca = a.createdAt || '';
  const cb = b.createdAt || '';
  if (ca !== cb) return ca < cb ? -1 : 1;
  const ia = a.id || '';
  const ib = b.id || '';
  if (ia === ib) return 0;
  return ia < ib ? -1 : 1;
}

/**
 * Live moves in the order they apply, optionally up to a date (inclusive)
 * and for one item. Deleted moves (tombstones) never count.
 * @param {Array<object>} moves
 * @param {{date?: string|null, itemId?: string|null}} [filter]
 * @returns {Array<object>}
 */
export function sortStockMoves(moves, { date = null, itemId = null } = {}) {
  return (moves || [])
    .filter(m => m && !m.deleted && (!date || m.date <= date) && (!itemId || m.itemId === itemId))
    .sort(compareMoves);
}
