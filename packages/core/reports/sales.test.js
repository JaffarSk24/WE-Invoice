import { describe, it, expect } from 'vitest';
import { salesReport, changePct } from './sales.js';
import { eurAmounts, partyOf, counts } from './amounts.js';
import { periodKey, periodKeys, previousYearKey, shiftYear } from './periods.js';
import { fastLineNet } from './lines.js';
import { lineAmounts } from '../vat/index.js';

const line = (over = {}) => ({ id: 'l1', name: 'Konzultácia', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23', ...over });
const totals = (net, vat = '0') => {
  const gross = (Number(net) + Number(vat)).toFixed(2);
  return { net, vat, gross, payable: gross };
};
export const doc = (over = {}) => ({
  id: over.id || 'd1', kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', issueDate: '2026-03-10', taxDate: '2026-03-10', dueDate: '2026-03-24',
  buyer: { name: 'Alfa s.r.o.' }, contactId: 'c1', lines: [line()], totals: totals('100.00', '23.00'), payments: [], ...over
});

describe('report amounts', () => {
  it('signs credit notes negative whatever sign they were stored with', () => {
    const positive = eurAmounts(doc({ kind: 'CREDIT_NOTE', totals: totals('50.00', '11.50') }));
    const negative = eurAmounts(doc({ kind: 'CREDIT_NOTE', totals: { net: '-50.00', vat: '-11.50', gross: '-61.50', payable: '-61.50' } }));
    expect(positive.net).toBe('-50.00');
    expect(negative.net).toBe('-50.00');
    expect(positive.gross).toBe('-61.50');
  });

  it('converts a foreign currency by the stored ECB rate', () => {
    const a = eurAmounts(doc({ currency: 'CZK', fxRate: '25', totals: totals('2500.00') }));
    expect(a.net).toBe('100.00');
    expect(a.converted).toBe(true);
    expect(eurAmounts(doc({ currency: 'CZK', fxRate: null, totals: totals('2500.00') })).converted).toBe(false);
  });

  it('computes what is still due from the payments', () => {
    const a = eurAmounts(doc({ payments: [{ id: 'p', date: '2026-03-20', amount: '23.00', method: 'TRANSFER', source: 'MANUAL' }] }));
    expect(a.paid).toBe('23.00');
    expect(a.due).toBe('100.00');
  });

  it('computes totals of a document stored without them', () => {
    expect(eurAmounts(doc({ totals: null })).gross).toBe('123.00');
  });

  it('skips drafts and cancelled documents and names the party', () => {
    expect(counts(doc({ status: 'DRAFT' }))).toBe(false);
    expect(counts(doc({ status: 'CANCELLED' }))).toBe(false);
    expect(counts(doc({ deleted: true }))).toBe(false);
    expect(partyOf(doc({ kind: 'RECEIVED_INVOICE', seller: { name: 'Dodávateľ' }, contactId: null })).name).toBe('Dodávateľ');
  });
});

describe('periods', () => {
  it('keys months, quarters and years', () => {
    expect(periodKey('2026-11-05', 'month')).toBe('2026-11');
    expect(periodKey('2026-11-05', 'quarter')).toBe('2026-Q4');
    expect(periodKey('2026-11-05', 'year')).toBe('2026');
    expect(periodKeys('2025-11-15', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(periodKeys('2026-01-01', '2026-12-31', 'quarter')).toEqual(['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']);
    expect(previousYearKey('2026-Q2')).toBe('2025-Q2');
    expect(shiftYear('2024-02-29')).toBe('2023-02-28');
  });
});

describe('fast line net', () => {
  it('matches the full EN 16931 line calculation', () => {
    const cases = [
      line(), line({ qty: '3', unitPrice: '19.99', discountPct: '7.5' }), line({ priceType: 'GROSS', unitPrice: '123', vatRate: '23' }),
      line({ priceType: 'GROSS', unitPrice: '10.05', vatRate: '19', qty: '7', discountPct: '3' }), line({ qty: '2.5', unitPrice: '3.3333', baseQty: '10' }),
      line({ vatCategory: 'AE', vatRate: null, qty: '-2', unitPrice: '45.10' })
    ];
    cases.forEach(l => expect(fastLineNet(l).toFixed(2)).toBe(lineAmounts(l).net));
  });

  it('ignores text and subtotal lines', () => {
    expect(fastLineNet({ id: 't', kind: 'TEXT', name: 'Nadpis' })).toBeNull();
  });
});

describe('salesReport', () => {
  const docs = [
    doc({ id: 'a', issueDate: '2026-01-15', taxDate: '2026-01-15', totals: totals('100.00', '23.00'), tags: ['web'], projectRef: 'P1' }),
    doc({ id: 'b', issueDate: '2026-02-03', taxDate: '2026-02-03', totals: totals('200.00', '46.00'), contactId: 'c2', buyer: { name: 'Beta a.s.' }, lines: [line({ itemId: 'i1', name: 'Hosting', qty: '2' })] }),
    doc({ id: 'c', kind: 'CREDIT_NOTE', issueDate: '2026-02-20', taxDate: '2026-02-20', totals: totals('50.00', '11.50') }),
    doc({ id: 'd', issueDate: '2025-01-10', taxDate: '2025-01-10', totals: totals('80.00', '18.40') }),
    doc({ id: 'e', status: 'DRAFT', issueDate: '2026-01-20', taxDate: '2026-01-20' }),
    doc({ id: 'f', kind: 'PROFORMA', issueDate: '2026-01-20', taxDate: '2026-01-20' }),
    doc({ id: 'g', kind: 'RECEIVED_INVOICE', issueDate: '2026-01-05', taxDate: '2026-01-05', seller: { name: 'Dodávateľ' }, contactId: 's1', totals: totals('40.00', '9.20') })
  ];

  it('sums sales of the period, credit notes subtracted, drafts and proformas skipped', () => {
    const r = salesReport(docs, { from: '2026-01-01', to: '2026-03-31' });
    expect(r.total.net).toBe('250.00');
    expect(r.total.count).toBe(3);
    expect(r.byPeriod.map(p => [p.key, p.net])).toEqual([['2026-01', '100.00'], ['2026-02', '150.00'], ['2026-03', '0.00']]);
  });

  it('compares with the same periods of last year', () => {
    const r = salesReport(docs, { from: '2026-01-01', to: '2026-03-31' });
    expect(r.byPeriod[0].prevNet).toBe('80.00');
    expect(r.byPeriod[0].change).toBe('25.0');
    expect(r.previous.net).toBe('80.00');
    expect(r.change).toBe('212.5');
  });

  it('groups by client, label, project and item', () => {
    const r = salesReport(docs, { from: '2026-01-01', to: '2026-12-31' });
    expect(r.byContact.map(c => [c.name, c.net])).toEqual([['Beta a.s.', '200.00'], ['Alfa s.r.o.', '50.00']]);
    expect(r.byLabel).toEqual([{ key: 'web', net: '100.00', gross: '123.00', count: 1 }]);
    expect(r.byProject.find(p => p.key === 'P1').net).toBe('100.00');
    const hosting = r.byItem.find(i => i.itemId === 'i1');
    expect(hosting).toMatchObject({ qty: '2', net: '200.00', count: 1 });
  });

  it('reports purchases separately and filters by label', () => {
    expect(salesReport(docs, { from: '2026-01-01', to: '2026-12-31', direction: 'purchases' }).total.net).toBe('40.00');
    expect(salesReport(docs, { from: '2026-01-01', to: '2026-12-31', label: 'web' }).total.net).toBe('100.00');
    expect(() => salesReport(docs, { direction: 'sideways' })).toThrow(/direction/);
  });

  it('spans all documents when no period is given', () => {
    const r = salesReport(docs, { granularity: 'year' });
    expect(r.byPeriod.map(p => p.key)).toEqual(['2025', '2026']);
  });

  it('gives no percentage change against zero', () => {
    expect(changePct('10', '0')).toBeNull();
    expect(changePct('50', '-100')).toBe('150.0');
  });
});
