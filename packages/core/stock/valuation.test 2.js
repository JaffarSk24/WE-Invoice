// Valuation by weighted average cost and FIFO, against the golden cases
// in tests/fixtures/stock/valuation.json and a few edge cases.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { costStockMoves, stockValuation, averageCost } from './index.js';

const fixture = JSON.parse(readFileSync(new URL('../../../tests/fixtures/stock/valuation.json', import.meta.url), 'utf8'));
const r = (id, date, qty, unitCost = null, itemId = 'i1') => ({ id, kind: 'RECEIPT', date, warehouseId: 'w1', itemId, qty, unitCost });
const i = (id, date, qty, itemId = 'i1') => ({ id, kind: 'ISSUE', date, warehouseId: 'w1', itemId, qty });

describe.each(['AVERAGE', 'FIFO'])('golden cases, %s', (method) => {
  it.each(fixture.cases.map(c => [c.name, c]))('%s', (_, c) => {
    const costed = costStockMoves(c.moves, { method });
    expect(costed.map(m => m.value)).toEqual(c[method].values);
    expect(stockValuation(c.moves, { method })).toEqual([{ itemId: 'i1', qty: c[method].qty, value: c[method].value, unitCost: c[method].unitCost }]);
  });
});

describe('averageCost', () => {
  const moves = [r('a', '2026-01-01', '3', '1.00'), r('b', '2026-01-02', '3', '2.00'), i('c', '2026-01-03', '1'), r('d', '2026-01-04', '1', '1.3333')];

  it('is the weighted average on each day', () => {
    expect(averageCost(moves, 'i1', '2026-01-01')).toBe('1.0000');
    expect(averageCost(moves, 'i1', '2026-01-02')).toBe('1.5000');
    expect(averageCost(moves, 'i1', '2026-01-03')).toBe('1.5000');
    expect(averageCost(moves, 'i1')).toBe('1.4717');
  });

  it('is zero for an item that never came in', () => {
    expect(averageCost(moves, 'other')).toBe('0.0000');
  });

  it('takes the current cost for a receipt without a cost', () => {
    const list = [r('a', '2026-01-01', '2', '5'), r('b', '2026-01-02', '2')];
    expect(averageCost(list, 'i1')).toBe('5.0000');
    expect(costStockMoves(list)[1].value).toBe('10.00');
  });

  it('keeps the last cost after the stock ran out', () => {
    const list = [r('a', '2026-01-01', '2', '5'), i('b', '2026-01-02', '2')];
    expect(averageCost(list, 'i1')).toBe('5.0000');
    expect(stockValuation(list)).toEqual([{ itemId: 'i1', qty: '0', value: '0.00', unitCost: '0.0000' }]);
  });

  it('leaves no value behind when everything is issued after a split', () => {
    const list = [r('a', '2026-01-01', '3', '1'), r('b', '2026-01-01', '3', '1.01'), i('c', '2026-01-02', '1'), i('d', '2026-01-03', '5')];
    const costed = costStockMoves(list);
    expect(costed[2].value).toBe('1.01');
    expect(costed[3].value).toBe('5.02');
    expect(costed[3].balanceValue).toBe('0.00');
  });
});

describe('FIFO', () => {
  it('consumes the oldest layer first', () => {
    const list = [r('a', '2026-01-01', '5', '1'), r('b', '2026-01-02', '5', '2'), i('c', '2026-01-03', '6')];
    const costed = costStockMoves(list, { method: 'FIFO' });
    expect(costed[2]).toMatchObject({ value: '7.00', unitCost: '1.1667', balanceQty: '4', balanceValue: '8.00' });
  });

  it('values items separately', () => {
    const list = [r('a', '2026-01-01', '1', '10'), r('b', '2026-01-01', '1', '20', 'i2'), i('c', '2026-01-02', '1', 'i2')];
    const result = stockValuation(list, { method: 'FIFO' });
    expect(result).toEqual(expect.arrayContaining([
      { itemId: 'i1', qty: '1', value: '10.00', unitCost: '10.0000' },
      { itemId: 'i2', qty: '0', value: '0.00', unitCost: '0.0000' }
    ]));
  });

  it('costs a shortfall at the last cost and covers it with the next receipt', () => {
    const list = [r('a', '2026-01-01', '2', '3'), i('b', '2026-01-02', '5'), r('c', '2026-01-03', '4', '4')];
    const costed = costStockMoves(list, { method: 'FIFO' });
    expect(costed[1].value).toBe('15.00');
    expect(costed[2]).toMatchObject({ balanceQty: '1', balanceValue: '4.00' });
  });

  it('refuses an unknown method', () => {
    expect(() => costStockMoves([], { method: 'LIFO' })).toThrow(expect.objectContaining({ code: 'STOCK_VALUATION_INVALID' }));
  });
});
