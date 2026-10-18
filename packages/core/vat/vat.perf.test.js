// Performance of computeTotals (01-product.md § 1.5, 11-testing-qa.md § 11.1).
// Runs in its own pass (npm run test:perf, vitest.perf.config.js) with no
// other test file in parallel, so the numbers measure the code and not a
// busy machine.
import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { computeTotals } from './index.js';

const line = (over = {}) => ({ id: 'l', name: 'a', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23', ...over });

describe('computeTotals performance', () => {
  // Best of five batches. A typical invoice must stay under 1 ms; a heavy
  // one (12 lines, foreign currency, prices with VAT, cash rounding) under
  // 3 ms. On an idle 2018 laptop they take about 0.06 ms and 0.35 ms.
  const bestPerDocument = (doc, runs = 400) => {
    for (let i = 0; i < 200; i++) computeTotals(doc, { cashRounding: true });
    let best = Infinity;
    for (let batch = 0; batch < 5; batch++) {
      const start = performance.now();
      for (let i = 0; i < runs; i++) computeTotals(doc, { cashRounding: true });
      best = Math.min(best, (performance.now() - start) / runs);
    }
    return best;
  };

  it('stays under 1 ms for a typical invoice', () => {
    const lines = Array.from({ length: 5 }, (_, i) => line({
      id: `t${i}`, qty: String(i + 1), unitPrice: `${i * 11}.50`, discountPct: i === 2 ? '10' : null,
      vatCategory: 'S', vatRate: i % 2 ? '23' : '5'
    }));
    expect(bestPerDocument({ currency: 'EUR', issueDate: '2026-10-18', docDiscount: { pct: '5' }, lines })).toBeLessThan(1);
  });

  it('stays under 3 ms for a heavy document', () => {
    const lines = Array.from({ length: 12 }, (_, i) => line({
      id: `l${i}`, qty: String(i + 1), unitPrice: `${i * 7}.99`, discountPct: i % 3 ? '5' : null,
      priceType: i % 2 ? 'GROSS' : 'NET', vatCategory: i % 4 === 3 ? 'AE' : 'S', vatRate: ['23', '19', '5'][i % 3]
    }));
    const doc = { currency: 'CZK', fxRate: '25.2', issueDate: '2026-10-18', docDiscount: { amount: '10' }, lines };
    expect(bestPerDocument(doc)).toBeLessThan(3);
  });
});
