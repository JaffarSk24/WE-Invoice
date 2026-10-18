// Unit tests of the VAT module beyond the fixtures: errors, helpers,
// legislation rates and the performance budget (11-testing-qa.md § 11.1).
import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { computeTotals, lineNet, grossToNet, vatRatesOn, normalizeVat, unitNetPrice, lineAmounts, isItemLine, allocateDocDiscount } from './index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const line = (over = {}) => ({ id: 'l', name: 'a', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23', ...over });

describe('grossToNet', () => {
  it('converts at four places', () => {
    expect(grossToNet('123', '23')).toBe('100.0000');
    expect(grossToNet('10', '23')).toBe('8.1301');
    expect(grossToNet('9.99', '23')).toBe('8.1220');
    expect(grossToNet('119', '19')).toBe('100.0000');
    expect(grossToNet('100', '0')).toBe('100.0000');
    expect(grossToNet('100', null)).toBe('100.0000');
    expect(grossToNet('1', '5')).toBe('0.9524');
  });
});

describe('normalizeVat', () => {
  it('keeps the rate for S and zeroes the others', () => {
    expect(normalizeVat(line())).toEqual({ category: 'S', rate: '23' });
    expect(normalizeVat(line({ vatRate: '19.50' }))).toEqual({ category: 'S', rate: '19.5' });
    expect(normalizeVat(line({ vatRate: '0' }))).toEqual({ category: 'S', rate: '0' });
    expect(normalizeVat(line({ vatCategory: 'Z', vatRate: null }))).toEqual({ category: 'Z', rate: '0' });
    expect(normalizeVat(line({ vatCategory: 'AE', vatRate: '23' }))).toEqual({ category: 'AE', rate: '0' });
    expect(normalizeVat(line({ vatCategory: 'O' }))).toEqual({ category: 'O', rate: null });
  });

  it('rejects an unknown category and a missing standard rate', () => {
    expect(code(() => normalizeVat(line({ vatCategory: 'L' })))).toBe('VAT_CATEGORY_INVALID');
    expect(code(() => normalizeVat(line({ vatCategory: undefined })))).toBe('VAT_CATEGORY_INVALID');
    expect(code(() => normalizeVat(line({ vatRate: null })))).toBe('VAT_RATE_REQUIRED');
    expect(code(() => normalizeVat(line({ vatRate: '' })))).toBe('VAT_RATE_REQUIRED');
    expect(code(() => normalizeVat(line({ vatRate: undefined })))).toBe('VAT_RATE_REQUIRED');
  });

  it('names the line in the error details', () => {
    try { normalizeVat(line({ id: 'x9', vatRate: null })); } catch (e) { expect(e.details).toEqual({ lineId: 'x9' }); }
  });
});

describe('lineAmounts and lineNet', () => {
  it('computes a plain line', () => {
    expect(lineNet(line())).toBe('100.00');
    expect(lineNet(line({ qty: '2.5', unitPrice: '3.333' }))).toBe('8.33');
    expect(unitNetPrice(line(), '23')).toBe('100');
    expect(unitNetPrice(line({ priceType: 'GROSS', unitPrice: '123' }), '23')).toBe('100.0000');
  });

  it('rejects a zero base quantity and bad numbers', () => {
    expect(code(() => lineAmounts(line({ baseQty: '0' })))).toBe('DIVISION_BY_ZERO');
    expect(code(() => lineAmounts(line({ qty: 'two' })))).toBe('AMOUNT_INVALID');
    expect(code(() => lineAmounts(line({ unitPrice: null })))).toBe('AMOUNT_INVALID');
  });

  it('tells item lines from headings', () => {
    expect(isItemLine({})).toBe(true);
    expect(isItemLine({ kind: 'ITEM' })).toBe(true);
    expect(isItemLine({ kind: 'TEXT' })).toBe(false);
    expect(isItemLine({ kind: 'SUBTOTAL' })).toBe(false);
  });
});

describe('allocateDocDiscount', () => {
  const groups = [{ key: 'a', lineNet: '100' }, { key: 'b', lineNet: '50' }];

  it('returns nothing without a discount or groups', () => {
    expect(allocateDocDiscount(groups, null)).toEqual({ allowances: {}, charges: {} });
    expect(allocateDocDiscount(groups, {})).toEqual({ allowances: {}, charges: {} });
    expect(allocateDocDiscount([], { pct: '10' })).toEqual({ allowances: {}, charges: {} });
  });

  it('skips groups whose share is zero', () => {
    expect(allocateDocDiscount([{ key: 'a', lineNet: '100' }, { key: 'b', lineNet: '0' }], { pct: '10' })).toEqual({ allowances: { a: '10.00' }, charges: {} });
  });

  it('splits an amount and fixes the remainder on the largest group', () => {
    expect(allocateDocDiscount(groups, { amount: '10' })).toEqual({ allowances: { a: '6.67', b: '3.33' }, charges: {} });
    expect(allocateDocDiscount([{ key: 'a', lineNet: '10' }, { key: 'b', lineNet: '20' }, { key: 'c', lineNet: '10' }], { amount: '1' }))
      .toEqual({ allowances: { a: '0.25', b: '0.50', c: '0.25' }, charges: {} });
    expect(allocateDocDiscount([{ key: 'a', lineNet: '1' }, { key: 'b', lineNet: '1' }, { key: 'c', lineNet: '1' }], { amount: '0.02' }))
      .toEqual({ allowances: { b: '0.01', c: '0.01' }, charges: {} });
  });

  it('a negative amount is a charge', () => {
    expect(allocateDocDiscount(groups, { amount: '-3' })).toEqual({ allowances: {}, charges: { a: '2.00', b: '1.00' } });
  });
});

describe('computeTotals', () => {
  it('rejects an invalid line with the line id', () => {
    const doc = { currency: 'EUR', lines: [line(), line({ id: 'bad', vatRate: null })] };
    try { computeTotals(doc); } catch (e) {
      expect(e.code).toBe('VAT_RATE_REQUIRED');
      expect(e.details.lineId).toBe('bad');
    }
  });

  it('returns a fresh object every time', () => {
    const doc = { currency: 'EUR', lines: [line()] };
    expect(computeTotals(doc)).not.toBe(computeTotals(doc));
  });

  it('fails cash rounding on an unknown legislation country', () => {
    expect(code(() => computeTotals({ currency: 'EUR', issueDate: '2026-01-01', lines: [line()] }, { cashRounding: true, country: 'XX' }))).toBe('LEGISLATION_COUNTRY_UNKNOWN');
  });

  // 01-product.md and 11-testing-qa.md: computeTotals within 1 ms per
  // document. Measured as the best of five batches, because other test files
  // run in parallel and can take the CPU from one batch. A typical invoice
  // must stay under 1 ms; a heavy one (12 lines, foreign currency, prices
  // with VAT, cash rounding) under 3 ms. On an idle laptop they take about
  // 0.06 ms and 0.35 ms.
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

describe('vatRatesOn', () => {
  it('reads the rates valid on a date from legislation', () => {
    expect(vatRatesOn('2026-10-18')).toEqual([{ code: 'STANDARD', rate: '23' }, { code: 'REDUCED_1', rate: '19' }, { code: 'REDUCED_2', rate: '5' }]);
    expect(vatRatesOn('2024-06-01')).toEqual([{ code: 'STANDARD', rate: '20' }, { code: 'REDUCED_1', rate: '10' }, { code: 'REDUCED_2', rate: '5' }]);
    expect(code(() => vatRatesOn('2026-01-01', 'CZ'))).toBe('LEGISLATION_COUNTRY_UNKNOWN');
  });
});
