// Data of the stock screens: what they read from the store (warehouses,
// moves, items, documents, price levels) and the few writes they make.
// Every write goes through here so the demo mode and a read-only data file
// are refused in one place, and every move is checked by the core before
// it is stored. In the demo there is no stock data: the screens show their
// empty states.
import { normalizeStockMove, stockLevels, VALUATION_METHODS } from '@we-invoice/core';
import { getStore, hasStore } from '../../store/index.js';
import { isDemo } from '../shell/demo-mode.js';
import { t } from '../../i18n/index.js';

export class StockError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'StockError';
    this.code = code;
  }
}

const store = () => (hasStore() ? getStore() : null);
const live = (list) => (list || []).filter(r => r && !r.deleted);

/** Why writing is not possible now (an error code), or null. */
export function writeBlocker() {
  if (isDemo()) return 'STOCK_DEMO';
  const s = store();
  if (!s || !s.company()) return 'NO_COMPANY';
  if (s.readOnly) return 'READ_ONLY';
  return null;
}

function assertWritable() {
  const code = writeBlocker();
  if (code) throw new StockError(code, `stock write refused: ${code}`);
  return store();
}

/** Everything the stock screens show, in one read. */
export function stockData() {
  const s = store();
  if (isDemo() || !s || !s.company()) {
    return { company: null, warehouses: [], moves: [], items: [], documents: [], priceLevels: [], contacts: [] };
  }
  return {
    company: s.company(),
    warehouses: live(s.list('warehouses')).sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || a.name.localeCompare(b.name)),
    moves: s.list('stockMoves'),
    items: live(s.list('items')),
    documents: s.list('documents'),
    priceLevels: live(s.list('priceLevels')),
    contacts: live(s.list('contacts'))
  };
}

/** Valuation method of the company: AVERAGE (default) or FIFO. */
export function valuationMethod(company) {
  const method = company?.stock?.valuation;
  return VALUATION_METHODS.includes(method) ? method : 'AVERAGE';
}

export async function setValuationMethod(method) {
  if (!VALUATION_METHODS.includes(method)) throw new StockError('STOCK_VALUATION_INVALID');
  const s = assertWritable();
  await s.updateCompany({ stock: { ...(s.company().stock || {}), valuation: method } });
}

/** The default warehouse, created on first use. @returns {Promise<string>} its id */
export async function ensureWarehouse() {
  const s = assertWritable();
  const list = live(s.list('warehouses'));
  const found = list.find(w => w.isDefault) || list[0];
  if (found) return found.id;
  const created = await s.insert('warehouses', { name: t('stock.warehouse.defaultName'), code: null, isDefault: true });
  return created.id;
}

export async function saveWarehouse(fields, id = null) {
  const s = assertWritable();
  const name = String(fields.name || '').trim();
  if (!name) throw new StockError('STOCK_WAREHOUSE_NAME');
  const patch = { name, code: fields.code ? String(fields.code).trim().slice(0, 20) : null };
  if (fields.isDefault) {
    for (const w of live(s.list('warehouses'))) if (w.isDefault && w.id !== id) await s.update('warehouses', w.id, { isDefault: false });
    patch.isDefault = true;
  }
  if (id) return s.update('warehouses', id, patch);
  const first = !live(s.list('warehouses')).length;
  return s.insert('warehouses', { isDefault: first, ...patch });
}

/** Removes a warehouse that holds nothing. */
export async function removeWarehouse(id) {
  const s = assertWritable();
  if (stockLevels(s.list('stockMoves'), { warehouseId: id }).length) throw new StockError('STOCK_WAREHOUSE_NOT_EMPTY');
  return s.remove('warehouses', id);
}

/** Checks and stores moves; returns the stored records. */
export async function addMoves(moves) {
  const s = assertWritable();
  const checked = moves.map(normalizeStockMove);
  const stored = [];
  for (const move of checked) stored.push(await s.insert('stockMoves', move));
  return stored;
}

/** Removes a move typed in by hand; moves of documents follow their document. */
export async function removeMove(id) {
  const s = assertWritable();
  const move = s.get('stockMoves', id);
  if (!move) throw new StockError('STOCK_MOVE_NOT_FOUND');
  if (move.docId) throw new StockError('STOCK_MOVE_FROM_DOCUMENT');
  return s.remove('stockMoves', id);
}

export async function savePriceLevel(fields, id = null) {
  const s = assertWritable();
  if (!String(fields.name || '').trim()) throw new StockError('STOCK_PRICE_LEVEL_NAME');
  const record = { ...fields, name: String(fields.name).trim() };
  return id ? s.update('priceLevels', id, record) : s.insert('priceLevels', record);
}

export async function removePriceLevel(id) {
  return assertWritable().remove('priceLevels', id);
}

/** Price of items on a level: item.prices[levelId]; an empty price removes it. */
export async function saveLevelPrices(levelId, prices) {
  const s = assertWritable();
  for (const [itemId, price] of Object.entries(prices)) {
    const item = s.get('items', itemId);
    if (!item) continue;
    const next = { ...(item.prices || {}) };
    if (price === null || price === '') delete next[levelId]; else next[levelId] = price;
    if (JSON.stringify(next) !== JSON.stringify(item.prices || {})) await s.update('items', itemId, { prices: next });
  }
}

/** A stock-tracked price list entry typed in from the stock screens. */
export async function createStockItem({ name, unitLabel, price, vatRate }) {
  const s = assertWritable();
  if (!String(name || '').trim()) throw new StockError('STOCK_ITEM_NAME');
  return s.insert('items', {
    name: String(name).trim(), code: null, barcode: null, unit: { code: 'C62', label: unitLabel || '' }, price: price || '0', priceType: 'NET',
    vatRate: vatRate ?? null, vatCategory: 'S', currency: s.company().defaults?.currency || 'EUR', stockTracked: true, minStock: null,
    warehouseQty: {}, prices: {}, accountingCategory: null, description: ''
  });
}
