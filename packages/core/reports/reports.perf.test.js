// Performance of the reports (01-product.md § 1.5): each report over 10 000
// documents within 200 ms, measured as the best of three runs after a
// warm-up, alone in the perf pass (npm run test:perf).
import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { salesReport, agingReport, cashflowForecast, profitability, searchIndex, searchQuery } from '../index.js';

const KINDS = ['INVOICE', 'INVOICE', 'INVOICE', 'CREDIT_NOTE', 'RECEIVED_INVOICE', 'EXPENSE_RECEIPT'];

function documents(n) {
  return Array.from({ length: n }, (_, i) => {
    const month = String((i % 12) + 1).padStart(2, '0');
    const day = String((i % 27) + 1).padStart(2, '0');
    const year = 2025 + (i % 2);
    const kind = KINDS[i % KINDS.length];
    const received = kind === 'RECEIVED_INVOICE' || kind === 'EXPENSE_RECEIPT';
    const net = `${100 + (i % 900)}.${String(i % 100).padStart(2, '0')}`;
    const lines = [1, 2, 3].map(l => ({ id: `l${l}`, itemId: `item${(i + l) % 300}`, name: `Item ${l}`, qty: String(l), unitPrice: `${10 + (i % 50)}.50`, vatCategory: 'S', vatRate: '23', discountPct: l === 2 ? '5' : null }));
    return {
      id: `d${i}`, kind, status: i % 10 === 0 ? 'DRAFT' : 'ISSUED', number: `FA${year}${String(i).padStart(5, '0')}`, vs: String(i),
      currency: i % 25 === 0 ? 'CZK' : 'EUR', fxRate: i % 25 === 0 ? '25.1' : null,
      issueDate: `${year}-${month}-${day}`, taxDate: `${year}-${month}-${day}`, dueDate: `${year}-${month}-${day}`,
      contactId: `c${i % 400}`, [received ? 'seller' : 'buyer']: { name: `Contact ${i % 400}` }, tags: i % 3 ? ['web'] : [], projectRef: i % 7 ? null : `P${i % 5}`,
      lines, totals: { net, vat: '0', gross: net, payable: net },
      payments: i % 4 ? [] : [{ id: `p${i}`, date: `${year}-${month}-${day}`, amount: '50', method: 'TRANSFER', source: 'MANUAL' }]
    };
  });
}

function best(fn, runs = 3) {
  fn();
  let min = Infinity;
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    min = Math.min(min, performance.now() - start);
  }
  return min;
}

describe('reports over 10 000 documents', () => {
  const docs = documents(10000);
  const ctx = { from: '2026-01-01', to: '2026-12-31', granularity: 'month' };

  it('sales report (with items and last year) under 200 ms', () => {
    expect(best(() => salesReport(docs, ctx))).toBeLessThan(200);
  });

  it('aging report under 200 ms', () => {
    expect(best(() => agingReport(docs, '2026-10-18'))).toBeLessThan(200);
  });

  it('cash flow forecast under 200 ms', () => {
    expect(best(() => cashflowForecast({ documents: docs, recurringTemplates: [] }, { today: '2026-10-18', months: 12 }))).toBeLessThan(200);
  });

  it('profitability under 200 ms', () => {
    expect(best(() => profitability(docs, ctx))).toBeLessThan(200);
  });

  it('search index and a query under 200 ms', () => {
    expect(best(() => searchQuery(searchIndex({ documents: docs }), 'FA2026'))).toBeLessThan(200);
  });
});
