// Moves and levels: validation, the quantity effect of each kind, levels
// on a date and per warehouse, warnings for negative and low stock.
import { describe, it, expect } from 'vitest';
import {
  normalizeStockMove, moveDeltas, sortStockMoves, stockLevels, stockOnHand, levelsByItem, negativeStockWarnings, lowStockItems
} from './index.js';

const move = (fields) => ({ id: fields.id || `${fields.kind}-${fields.date}-${fields.qty}`, warehouseId: 'w1', itemId: 'i1', ...fields });

describe('normalizeStockMove', () => {
  it('fills the optional fields and trims the quantity', () => {
    const m = normalizeStockMove({ kind: 'RECEIPT', date: '2026-10-01', warehouseId: 'w1', itemId: 'i1', qty: ' 5 ' });
    expect(m).toMatchObject({ qty: '5', unitCost: null, targetWarehouseId: null, docId: null, note: null });
  });

  it.each([
    [{ kind: 'LOAN' }, 'kind'],
    [{ date: '1.10.2026' }, 'date'],
    [{ warehouseId: '' }, 'warehouseId'],
    [{ itemId: null }, 'itemId'],
    [{ qty: 'abc' }, 'qty'],
    [{ qty: '0' }, 'qty'],
    [{ qty: '-2' }, 'qty'],
    [{ kind: 'TRANSFER' }, 'targetWarehouseId'],
    [{ kind: 'TRANSFER', targetWarehouseId: 'w1' }, 'targetWarehouseId'],
    [{ unitCost: '-1' }, 'unitCost']
  ])('refuses %j', (patch, field) => {
    const base = { kind: 'RECEIPT', date: '2026-10-01', warehouseId: 'w1', itemId: 'i1', qty: '1' };
    expect(() => normalizeStockMove({ ...base, ...patch })).toThrow(expect.objectContaining({ code: 'STOCK_MOVE_INVALID', details: { field } }));
  });

  it('accepts a negative inventory difference and drops a target outside transfers', () => {
    const m = normalizeStockMove({ kind: 'ADJUSTMENT', date: '2026-10-01', warehouseId: 'w1', itemId: 'i1', qty: '-1.5', targetWarehouseId: 'w2' });
    expect(m.qty).toBe('-1.5');
    expect(m.targetWarehouseId).toBe(null);
  });
});

describe('moveDeltas', () => {
  it('maps every kind to warehouse changes', () => {
    expect(moveDeltas(move({ kind: 'RECEIPT', qty: '3' }))).toEqual([{ warehouseId: 'w1', qty: '3' }]);
    expect(moveDeltas(move({ kind: 'ISSUE', qty: '3' }))).toEqual([{ warehouseId: 'w1', qty: '-3' }]);
    expect(moveDeltas(move({ kind: 'ADJUSTMENT', qty: '-2' }))).toEqual([{ warehouseId: 'w1', qty: '-2' }]);
    expect(moveDeltas(move({ kind: 'TRANSFER', qty: '3', targetWarehouseId: 'w2' }))).toEqual([{ warehouseId: 'w1', qty: '-3' }, { warehouseId: 'w2', qty: '3' }]);
  });
});

describe('sortStockMoves', () => {
  it('orders by date, then creation time, and skips tombstones', () => {
    const list = [
      move({ id: 'c', kind: 'ISSUE', date: '2026-10-02', qty: '1', createdAt: '2026-10-02T08:00:00Z' }),
      move({ id: 'b', kind: 'RECEIPT', date: '2026-10-02', qty: '1', createdAt: '2026-10-02T07:00:00Z' }),
      move({ id: 'a', kind: 'RECEIPT', date: '2026-10-01', qty: '1' }),
      move({ id: 'x', kind: 'RECEIPT', date: '2026-09-01', qty: '1', deleted: true })
    ];
    expect(sortStockMoves(list).map(m => m.id)).toEqual(['a', 'b', 'c']);
    expect(sortStockMoves(list, { date: '2026-10-01' }).map(m => m.id)).toEqual(['a']);
  });
});

describe('stockLevels', () => {
  const moves = [
    move({ kind: 'RECEIPT', date: '2026-10-01', qty: '10' }),
    move({ kind: 'RECEIPT', date: '2026-10-01', qty: '2.5', itemId: 'i2' }),
    move({ kind: 'ISSUE', date: '2026-10-03', qty: '4' }),
    move({ kind: 'TRANSFER', date: '2026-10-05', qty: '3', targetWarehouseId: 'w2' }),
    move({ kind: 'ADJUSTMENT', date: '2026-10-07', qty: '-0.5', itemId: 'i2' }),
    move({ id: 'gone', kind: 'RECEIPT', date: '2026-10-02', qty: '100', deleted: true })
  ];

  it('sums per item and warehouse', () => {
    expect(stockLevels(moves)).toEqual(expect.arrayContaining([
      { itemId: 'i1', warehouseId: 'w1', qty: '3' },
      { itemId: 'i1', warehouseId: 'w2', qty: '3' },
      { itemId: 'i2', warehouseId: 'w1', qty: '2' }
    ]));
  });

  it('gives the balance at the end of a day', () => {
    expect(stockOnHand(moves, 'i1', { date: '2026-10-02' })).toBe('10');
    expect(stockOnHand(moves, 'i1', { date: '2026-10-04' })).toBe('6');
    expect(stockOnHand(moves, 'i1', { date: '2026-09-30' })).toBe('0');
  });

  it('filters one warehouse and totals per item', () => {
    expect(stockOnHand(moves, 'i1', { warehouseId: 'w2' })).toBe('3');
    expect(levelsByItem(stockLevels(moves)).get('i1')).toBe('6');
  });

  it('drops pairs back at zero unless asked', () => {
    const zero = [move({ kind: 'RECEIPT', date: '2026-10-01', qty: '1' }), move({ kind: 'ISSUE', date: '2026-10-02', qty: '1' })];
    expect(stockLevels(zero)).toEqual([]);
    expect(stockLevels(zero, { keepZero: true })).toEqual([{ itemId: 'i1', warehouseId: 'w1', qty: '0' }]);
  });

  it('keeps decimal quantities exact', () => {
    const tenths = Array.from({ length: 10 }, (_, i) => move({ id: `t${i}`, kind: 'RECEIPT', date: '2026-10-01', qty: '0.1' }));
    expect(stockOnHand(tenths, 'i1')).toBe('1');
  });
});

describe('negativeStockWarnings', () => {
  const stock = [move({ kind: 'RECEIPT', date: '2026-10-05', qty: '5' })];

  it('warns when an issue takes more than there is', () => {
    expect(negativeStockWarnings(stock, [move({ kind: 'ISSUE', date: '2026-10-06', qty: '7' })]))
      .toEqual([{ itemId: 'i1', warehouseId: 'w1', qty: '-2', date: '2026-10-06' }]);
  });

  it('warns for a backdated sale even when today is covered', () => {
    expect(negativeStockWarnings(stock, [move({ kind: 'ISSUE', date: '2026-10-01', qty: '2' })]))
      .toEqual([{ itemId: 'i1', warehouseId: 'w1', qty: '-2', date: '2026-10-01' }]);
  });

  it('does not warn when a receipt of the same day covers the sale', () => {
    const sameDay = [move({ id: 'r', kind: 'RECEIPT', date: '2026-10-01', qty: '3', createdAt: '2026-10-01T10:00:00Z' })];
    expect(negativeStockWarnings(sameDay, [move({ id: 's', kind: 'ISSUE', date: '2026-10-01', qty: '2', createdAt: '2026-10-01T09:00:00Z' })])).toEqual([]);
  });

  it('checks the source warehouse of a transfer', () => {
    const w = negativeStockWarnings(stock, [move({ kind: 'TRANSFER', date: '2026-10-06', qty: '6', targetWarehouseId: 'w2' })]);
    expect(w).toEqual([{ itemId: 'i1', warehouseId: 'w1', qty: '-1', date: '2026-10-06' }]);
  });
});

describe('lowStockItems', () => {
  it('lists tracked items under their minimum over all warehouses', () => {
    const items = [
      { id: 'i1', stockTracked: true, minStock: '5' },
      { id: 'i2', stockTracked: true, minStock: '1' },
      { id: 'i3', stockTracked: false, minStock: '9' },
      { id: 'i4', stockTracked: true, minStock: null }
    ];
    const levels = [{ itemId: 'i1', warehouseId: 'w1', qty: '2' }, { itemId: 'i1', warehouseId: 'w2', qty: '2' }, { itemId: 'i2', warehouseId: 'w1', qty: '1' }];
    expect(lowStockItems(items, levels)).toEqual([{ itemId: 'i1', qty: '4', minStock: '5' }]);
  });
});
