// The stock screens' logic over a real store in memory: moves of documents
// follow the documents without doubling, the quick sale issues a numbered
// receipt and takes the goods out of stock, the cart rules, and the rows
// of the levels and movement tables.
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, memoryAdapter } from '../../store/index.js';
import { resetPrefsCache, setPref } from '../../prefs.js';
import { stockData, addMoves, ensureWarehouse, saveWarehouse, removeWarehouse, removeMove, setValuationMethod, valuationMethod, writeBlocker } from './data.js';
import { syncDocumentMoves, queueDocumentSync } from './document-moves.js';
import { checkout } from './sale/checkout.js';
import { addToCart, setCartQty, setCartVat, changeCartQty, removeFromCart, findByCode, searchItems, cartPreview } from './sale/cart.js';
import { levelRows } from './levels-tab.js';
import { moveRows } from './moves-tab.js';
import { tabFromHash } from './index.js';

let store;
const paint = { name: 'Farba biela', code: 'FB1', barcode: '8580000000017', unit: { code: 'C62', label: 'ks' }, price: '12.30', priceType: 'GROSS', vatCategory: 'S', vatRate: '23', currency: 'EUR', stockTracked: true, minStock: '5' };
const service = { name: 'Montáž', unit: { code: 'HUR', label: 'h' }, price: '30', priceType: 'NET', vatCategory: 'S', vatRate: '23', currency: 'EUR', stockTracked: false };

async function setup() {
  store = createStore({ adapter: memoryAdapter(), emitter: () => {} });
  await store.open();
  await store.createCompany({ name: 'Alfa, s. r. o.', legalForm: 'SRO', taxpayerType: 'PO', vatMode: 'PAYER', accountingMode: 'NONE', icDph: 'SK2020000004', defaults: { currency: 'EUR', language: 'sk' }, series: [] });
  const item = await store.insert('items', paint);
  const work = await store.insert('items', service);
  return { item, work };
}

const invoice = (itemId, fields = {}) => ({
  kind: 'INVOICE', status: 'ISSUED', number: 'FA20260001', issueDate: '2026-10-10', currency: 'EUR', links: [],
  lines: [{ id: 'l1', kind: 'ITEM', itemId, name: 'Farba', qty: '3', unitPrice: '10', priceType: 'NET', vatCategory: 'S', vatRate: '23' }], ...fields
});

beforeEach(() => { localStorage.clear(); resetPrefsCache(); });

describe('document moves', () => {
  it('issues the goods of an issued invoice once, however often it runs', async () => {
    const { item } = await setup();
    const doc = await store.insert('documents', invoice(item.id));
    await syncDocumentMoves(doc.id);
    await syncDocumentMoves(doc.id);
    await Promise.all([queueDocumentSync(doc.id), queueDocumentSync(doc.id)]);
    const moves = store.list('stockMoves');
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ kind: 'ISSUE', qty: '3', itemId: item.id, docId: doc.id });
    expect(store.list('warehouses')).toHaveLength(1);
  });

  it('takes the moves back when the document is cancelled or deleted', async () => {
    const { item } = await setup();
    const doc = await store.insert('documents', invoice(item.id));
    await syncDocumentMoves(doc.id);
    await store.update('documents', doc.id, { status: 'CANCELLED' });
    await syncDocumentMoves(doc.id);
    expect(store.list('stockMoves')).toHaveLength(0);
    await store.update('documents', doc.id, { status: 'ISSUED' });
    const { inserted } = await syncDocumentMoves(doc.id);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].id).toMatch(/r1$/);
    await store.remove('documents', doc.id);
    await syncDocumentMoves(doc.id);
    expect(store.list('stockMoves')).toHaveLength(0);
  });

  it('moves the goods to the delivery note made for an invoice', async () => {
    const { item } = await setup();
    const doc = await store.insert('documents', invoice(item.id));
    await syncDocumentMoves(doc.id);
    const note = await store.insert('documents', invoice(item.id, { kind: 'DELIVERY_NOTE', number: 'DL20260001', links: [{ kind: 'DELIVERY_FOR', docId: doc.id }] }));
    const { warnings } = await syncDocumentMoves(note.id);
    const moves = store.list('stockMoves');
    expect(moves.map(m => m.docId)).toEqual([note.id]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('does nothing in the demo', async () => {
    const { item } = await setup();
    setPref('demo', true);
    const doc = await store.insert('documents', invoice(item.id));
    expect(writeBlocker()).toBe('STOCK_DEMO');
    expect(await syncDocumentMoves(doc.id)).toEqual({ inserted: [], warnings: [] });
    await expect(addMoves([])).rejects.toMatchObject({ code: 'STOCK_DEMO' });
  });
});

describe('warehouses and manual moves', () => {
  it('creates the default warehouse once and refuses to remove a full one', async () => {
    const { item } = await setup();
    const id = await ensureWarehouse();
    expect(await ensureWarehouse()).toBe(id);
    const second = await saveWarehouse({ name: 'Predajňa', isDefault: true });
    expect(store.get('warehouses', id).isDefault).toBe(false);
    expect(second.isDefault).toBe(true);
    const [move] = await addMoves([{ kind: 'RECEIPT', date: '2026-10-01', warehouseId: id, itemId: item.id, qty: '2', unitCost: '8' }]);
    await expect(removeWarehouse(id)).rejects.toMatchObject({ code: 'STOCK_WAREHOUSE_NOT_EMPTY' });
    await removeMove(move.id);
    await removeWarehouse(id);
    expect(stockData().warehouses.map(w => w.name)).toEqual(['Predajňa']);
  });

  it('refuses invalid moves and moves of documents', async () => {
    const { item } = await setup();
    const id = await ensureWarehouse();
    await expect(addMoves([{ kind: 'ISSUE', date: '2026-10-01', warehouseId: id, itemId: item.id, qty: '-1' }])).rejects.toMatchObject({ code: 'STOCK_MOVE_INVALID' });
    const doc = await store.insert('documents', invoice(item.id));
    const { inserted } = await syncDocumentMoves(doc.id);
    await expect(removeMove(inserted[0].id)).rejects.toMatchObject({ code: 'STOCK_MOVE_FROM_DOCUMENT' });
  });

  it('keeps the valuation method on the company', async () => {
    await setup();
    expect(valuationMethod(store.company())).toBe('AVERAGE');
    await setValuationMethod('FIFO');
    expect(valuationMethod(store.company())).toBe('FIFO');
    await expect(setValuationMethod('LIFO')).rejects.toMatchObject({ code: 'STOCK_VALUATION_INVALID' });
  });
});

describe('quick sale', () => {
  it('issues numbered receipts, keeps the series and takes the goods out', async () => {
    const { item, work } = await setup();
    const id = await ensureWarehouse();
    await addMoves([{ kind: 'RECEIPT', date: '2026-01-02', warehouseId: id, itemId: item.id, qty: '10', unitCost: '6' }]);
    const first = await checkout([{ item: store.get('items', item.id), qty: '2' }, { item: store.get('items', work.id), qty: '1' }], { method: 'CASH' });
    expect(first.document).toMatchObject({ kind: 'SALES_RECEIPT', status: 'PAID' });
    expect(first.document.number).toMatch(/^PR\d{4}0001$/);
    expect(first.warnings).toEqual([]);
    const second = await checkout([{ item: store.get('items', item.id), qty: '9' }], { method: 'CARD' });
    expect(second.document.number).toMatch(/0002$/);
    expect(second.warnings).toEqual([expect.objectContaining({ qty: '-1' })]);
    expect(store.company().series.filter(s => s.kind === 'SALES_RECEIPT')).toHaveLength(1);
    const rows = levelRows(stockData());
    expect(rows.find(r => r.id === item.id)).toMatchObject({ qty: '-1', negative: true, low: true });
    expect(rows.find(r => r.id === work.id)).toBeUndefined();
  });
});

describe('cart', () => {
  const a = { id: 'a', name: 'Alfa', code: 'A1', barcode: '111', price: '1.00', priceType: 'GROSS', vatCategory: 'S', vatRate: '23' };
  const b = { id: 'b', name: 'Beta', code: 'b2', barcode: null, price: '0.99', priceType: 'GROSS', vatCategory: 'S', vatRate: '23' };

  it('keeps the VAT choice of a line and says when the buyer is needed', () => {
    const payer = { vatMode: 'PAYER' };
    let cart = setCartVat(addToCart([], a), 'a', 'AE');
    expect(cart[0].vat).toBe('AE');
    const preview = cartPreview(cart, { company: payer, method: 'CARD', date: '2026-10-18' });
    expect(preview).toMatchObject({ gross: '0.81', vat: '0.00', buyerNeed: 'AE' });
    expect(preview.lines[0].category).toBe('AE');
    cart = setCartVat(cart, 'a', null);
    expect(cartPreview(cart, { company: payer, method: 'CARD', date: '2026-10-18' })).toMatchObject({ gross: '1.00', buyerNeed: null });
  });

  it('adds, changes and removes lines', () => {
    let cart = addToCart([], a);
    cart = addToCart(cart, a);
    cart = addToCart(cart, b, '3');
    expect(cart.map(e => [e.item.id, e.qty])).toEqual([['a', '2'], ['b', '3']]);
    cart = changeCartQty(cart, 'a', '-1');
    expect(cart[0].qty).toBe('1');
    cart = changeCartQty(cart, 'a', '-1');
    expect(cart.map(e => e.item.id)).toEqual(['b']);
    expect(setCartQty(cart, 'b', '0')).toEqual([]);
    expect(removeFromCart(cart, 'b')).toEqual([]);
  });

  it('finds items by barcode, code and name', () => {
    expect(findByCode([a, b], '111')).toBe(a);
    expect(findByCode([a, b], 'B2')).toBe(b);
    expect(findByCode([a, b], 'zzz')).toBe(null);
    expect(searchItems([b, a], 'et').map(i => i.id)).toEqual(['b']);
  });

  it('previews the totals with cash rounding', () => {
    const cart = [{ item: a, qty: '1' }, { item: b, qty: '1' }];
    expect(cartPreview(cart, { method: 'CASH', date: '2026-10-18' })).toMatchObject({ gross: '1.98', payable: '2.00', rounding: '0.02' });
    expect(cartPreview(cart, { method: 'CARD', date: '2026-10-18' })).toMatchObject({ payable: '1.98', rounding: '0.00' });
  });
});

describe('table rows', () => {
  it('lists moves of a period with costs, newest first', async () => {
    const { item } = await setup();
    const id = await ensureWarehouse();
    await addMoves([
      { kind: 'RECEIPT', date: '2026-01-02', warehouseId: id, itemId: item.id, qty: '4', unitCost: '5' },
      { kind: 'ISSUE', date: '2026-02-02', warehouseId: id, itemId: item.id, qty: '1' }
    ]);
    const rows = moveRows(stockData(), { from: '2026-02-01', to: '2026-12-31' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'ISSUE', qty: '-1', unitCost: '5.0000', value: '5.00', balance: '3', manual: true });
    expect(levelRows(stockData(), { query: '858000' })).toHaveLength(0);
    expect(levelRows(stockData(), { query: '8580000000017' })).toHaveLength(1);
  });

  it('reads the tab from the address', () => {
    expect(tabFromHash('#/stock/moves')).toBe('moves');
    expect(tabFromHash('#/stock')).toBe('levels');
    expect(tabFromHash('#/stock/unknown')).toBe('levels');
  });
});
