// Warehouses, stock moves and price levels (03-features.md § 3.4).
import { entity, enumOf, ID, NULLABLE_ID, SHORT_TEXT, NULLABLE_TEXT, DECIMAL, NULLABLE_DECIMAL, DATE } from '../common.js';
import { STOCK_MOVE_KINDS } from '../enums.js';

export const warehouseSchema = entity('Warehouse', {
  name: SHORT_TEXT,
  code: { type: ['string', 'null'], maxLength: 20 },
  isDefault: { type: 'boolean' }
}, ['name']);

export const stockMoveSchema = entity('StockMove', {
  kind: enumOf(STOCK_MOVE_KINDS),
  date: DATE,
  warehouseId: ID,
  targetWarehouseId: NULLABLE_ID,
  itemId: ID,
  qty: DECIMAL,
  unitCost: NULLABLE_DECIMAL,
  docId: NULLABLE_ID,
  note: NULLABLE_TEXT
}, ['kind', 'date', 'warehouseId', 'itemId', 'qty']);

export const priceLevelSchema = entity('PriceLevel', {
  name: SHORT_TEXT,
  discountPct: NULLABLE_DECIMAL
}, ['name']);
