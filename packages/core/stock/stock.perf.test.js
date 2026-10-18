// Speed of the stock screen data on a large book: levels, one item's
// balance and the valuation over 10 000 moves stay well inside a frame
// budget a user does not notice (06-quality: lists under 200 ms).
import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { stockLevels, stockOnHand, stockValuation, negativeStockWarnings } from './index.js';

function book(count) {
  const moves = [];
  for (let n = 0; n < count; n += 1) {
    const day = String(1 + (n % 28)).padStart(2, '0');
    const month = String(1 + (Math.floor(n / 28) % 12)).padStart(2, '0');
    const kind = n % 4 === 0 ? 'ISSUE' : n % 17 === 0 ? 'TRANSFER' : n % 29 === 0 ? 'ADJUSTMENT' : 'RECEIPT';
    moves.push({
      id: `m${String(n).padStart(6, '0')}`, kind, date: `2026-${month}-${day}`, warehouseId: `w${n % 3}`,
      targetWarehouseId: kind === 'TRANSFER' ? `w${(n + 1) % 3}` : null, itemId: `i${n % 200}`,
      qty: kind === 'ADJUSTMENT' ? '-0.5' : String(1 + (n % 7)), unitCost: kind === 'RECEIPT' ? `${1 + (n % 13)}.25` : null
    });
  }
  return moves;
}

const time = (fn) => { const start = performance.now(); const result = fn(); return { result, ms: performance.now() - start }; };

describe('stock on 10 000 moves', () => {
  const moves = book(10000);

  it('computes all levels in under 200 ms', () => {
    stockLevels(moves);
    const { result, ms } = time(() => stockLevels(moves, { date: '2026-12-31' }));
    expect(result.length).toBeGreaterThan(200);
    expect(ms).toBeLessThan(200);
  });

  it('gives one item balance in under 50 ms', () => {
    const { result, ms } = time(() => stockOnHand(moves, 'i7', { date: '2026-06-30' }));
    expect(result).toMatch(/^-?\d+(\.\d+)?$/);
    expect(ms).toBeLessThan(50);
  });

  it('values the whole stock in under 500 ms', () => {
    const { result, ms } = time(() => stockValuation(moves, { method: 'AVERAGE' }));
    expect(result).toHaveLength(200);
    expect(ms).toBeLessThan(500);
    expect(time(() => stockValuation(moves, { method: 'FIFO' })).ms).toBeLessThan(500);
  });

  it('checks a new sale for negative stock in under 100 ms', () => {
    const sale = [{ id: 'new', kind: 'ISSUE', date: '2026-12-31', warehouseId: 'w0', itemId: 'i0', qty: '1' }];
    expect(time(() => negativeStockWarnings(moves, sale)).ms).toBeLessThan(100);
  });
});
