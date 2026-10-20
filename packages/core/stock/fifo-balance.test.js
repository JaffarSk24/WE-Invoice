// The FIFO pool keeps the quantity and value on hand as running totals.
// This checks them after every move against a plain FIFO written here from
// the rule itself (receipts become layers, issues take the oldest first,
// an issue beyond the stock is a shortfall the next receipt covers).
import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import { costStockMoves } from './valuation.js';

function plainFifo(moves) {
  const pools = new Map();
  return moves.map(move => {
    const p = pools.get(move.itemId) || { layers: [], shortfall: new Big(0), last: '0' };
    pools.set(move.itemId, p);
    const delta = move.kind === 'ISSUE' ? new Big(move.qty).neg() : move.kind === 'TRANSFER' ? new Big(0) : new Big(move.qty);
    if (delta.gt(0)) {
      const cost = move.unitCost ?? (p.layers.length ? p.layers[p.layers.length - 1].cost : p.last);
      let rest = delta;
      const covered = rest.lt(p.shortfall) ? rest : p.shortfall;
      p.shortfall = p.shortfall.minus(covered);
      rest = rest.minus(covered);
      if (rest.gt(0)) p.layers.push({ qty: rest, cost });
      p.last = cost;
    } else if (delta.lt(0)) {
      let rest = delta.abs();
      while (rest.gt(0) && p.layers.length) {
        const layer = p.layers[0];
        const taken = rest.lt(layer.qty) ? rest : layer.qty;
        layer.qty = layer.qty.minus(taken);
        rest = rest.minus(taken);
        p.last = layer.cost;
        if (layer.qty.eq(0)) p.layers.shift();
      }
      if (rest.gt(0)) p.shortfall = p.shortfall.plus(rest);
    }
    const qty = p.layers.reduce((s, l) => s.plus(l.qty), new Big(0)).minus(p.shortfall);
    const value = p.layers.reduce((s, l) => s.plus(l.qty.times(l.cost)), new Big(0));
    return { qty: qty.toFixed() === '-0' ? '0' : qty.toFixed(), value: value.round(2, Big.roundHalfUp).toFixed(2) };
  });
}

describe('FIFO balances', () => {
  it('match a plain FIFO after every move', () => {
    let seed = 5;
    const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const moves = Array.from({ length: 1500 }, (_, n) => {
      const r = rand();
      const kind = r < 0.4 ? 'ISSUE' : r < 0.45 ? 'TRANSFER' : 'RECEIPT';
      return {
        id: `m${String(n).padStart(5, '0')}`, kind, date: `2026-01-${String(1 + (n % 28)).padStart(2, '0')}`, warehouseId: 'w0',
        targetWarehouseId: kind === 'TRANSFER' ? 'w1' : null, itemId: `i${n % 7}`, qty: `${1 + Math.floor(rand() * 9)}${rand() < 0.3 ? '.5' : ''}`,
        unitCost: kind === 'RECEIPT' && rand() < 0.8 ? `${1 + Math.floor(rand() * 20)}.${String(Math.floor(rand() * 100)).padStart(2, '0')}` : null
      };
    });
    const costed = costStockMoves(moves, { method: 'FIFO' });
    const ordered = costed.map(m => moves.find(x => x.id === m.id));
    const expected = plainFifo(ordered);
    costed.forEach((m, i) => {
      expect([m.id, m.balanceQty, m.balanceValue]).toEqual([m.id, expected[i].qty, expected[i].value]);
    });
  });
});
