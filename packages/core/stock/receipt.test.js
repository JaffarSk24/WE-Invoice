// The quick sale (predajka), stocktaking differences and the CSV writer.
import { describe, it, expect } from 'vitest';
import {
  salesReceiptSeries, issueSalesReceipt, vrpSummary, movesForDocument, inventoryDifferences, hasShortage, stockCsv
} from './index.js';

const company = { id: 'c1', name: 'Alfa, s. r. o.', vatMode: 'PAYER', icDph: 'SK2020000004', defaults: { currency: 'EUR', language: 'sk' }, series: [] };
const paint = { id: 'i1', name: 'Farba', price: '12.30', priceType: 'GROSS', vatCategory: 'S', vatRate: '23', stockTracked: true, unit: { code: 'C62', label: 'ks' } };
const brush = { id: 'i2', name: 'Štetec', price: '2.02', priceType: 'NET', vatCategory: 'S', vatRate: '23', stockTracked: true, unit: { code: 'C62', label: 'ks' } };
const NOW = '2026-10-18T08:30:00.000Z';

function sale(extra = {}) {
  const { series } = salesReceiptSeries(company, { id: 's1' });
  return issueSalesReceipt([{ item: paint, qty: '2' }, { item: brush, qty: '1' }], { company, series, now: NOW, warehouseId: 'w1', ...extra });
}

describe('salesReceiptSeries', () => {
  it('creates a yearly series when the company has none', () => {
    expect(salesReceiptSeries(company, { id: 's1' })).toEqual({
      created: true, series: { id: 's1', name: 'PR', kind: 'SALES_RECEIPT', mask: 'PR{YYYY}{N:4}', vsMask: null, reset: 'YEARLY', isDefault: true, counters: {} }
    });
  });

  it('reuses the default series of the company', () => {
    const own = { id: 'x', kind: 'SALES_RECEIPT', mask: 'P{N}', reset: 'NEVER', isDefault: true };
    expect(salesReceiptSeries({ ...company, series: [{ id: 'f', kind: 'INVOICE', mask: 'F{N}', reset: 'NEVER' }, own] })).toEqual({ series: own, created: false });
  });
});

describe('issueSalesReceipt', () => {
  it('issues a paid receipt without a client, rounded for cash', () => {
    const { document, series } = sale();
    expect(document).toMatchObject({ kind: 'SALES_RECEIPT', number: 'PR20260001', issueDate: '2026-10-18', buyer: null, status: 'PAID', paymentMethod: 'CASH' });
    expect(document.totals.gross).toBe('27.08');
    expect(document.totals.payable).toBe('27.10');
    expect(document.payments).toEqual([expect.objectContaining({ amount: '27.10', method: 'CASH', source: 'CASH', date: '2026-10-18' })]);
    expect(series.counters).toEqual({ 2026: 2 });
  });

  it('does not round a card payment and allows a partial payment', () => {
    const card = sale({ method: 'CARD' }).document;
    expect(card.totals.payable).toBe('27.08');
    const part = sale({ method: 'CARD', paid: '10' }).document;
    expect(part.status).toBe('PARTIALLY_PAID');
    expect(part.payments[0]).toMatchObject({ amount: '10.00', source: 'MANUAL' });
  });

  it('sells outside VAT for a non-payer', () => {
    const { series } = salesReceiptSeries(company, { id: 's1' });
    const { document } = issueSalesReceipt([{ item: brush, qty: '1' }], { company: { ...company, vatMode: 'NONPAYER', dic: '1020000001' }, series, now: NOW, method: 'CARD' });
    expect(document.lines[0]).toMatchObject({ vatCategory: 'O', vatRate: null });
    expect(document.totals.vat).toBe('0.00');
  });

  it('causes stock issues from the chosen warehouse', () => {
    const { document } = sale();
    const moves = movesForDocument(document, { items: [paint, brush] });
    expect(moves.map(m => [m.kind, m.itemId, m.qty, m.warehouseId])).toEqual([['ISSUE', 'i1', '2', 'w1'], ['ISSUE', 'i2', '1', 'w1']]);
  });

  it('refuses an empty cart and an unknown payment', () => {
    const { series } = salesReceiptSeries(company);
    expect(() => issueSalesReceipt([], { company, series })).toThrow(expect.objectContaining({ code: 'CART_EMPTY' }));
    expect(() => issueSalesReceipt([{ item: paint, qty: '1' }], { company, series, method: 'TRANSFER' })).toThrow(expect.objectContaining({ code: 'PAYMENT_METHOD_INVALID' }));
  });
});

describe('vrpSummary', () => {
  it('lists the lines with VAT, the VAT summary and the payment', () => {
    const summary = vrpSummary(sale().document);
    expect(summary).toMatchObject({ number: 'PR20260001', method: 'CASH', total: '27.08', rounding: '0.02', payable: '27.10', paid: '27.10' });
    expect(summary.lines).toEqual([
      { name: 'Farba', qty: '2', unitPrice: '12.30', category: 'S', vatRate: '23', total: '24.60', exemption: null },
      { name: 'Štetec', qty: '1', unitPrice: '2.48', category: 'S', vatRate: '23', total: '2.48', exemption: null }
    ]);
    expect(summary.vat).toEqual([{ category: 'S', rate: '23', base: '22.02', vat: '5.06', total: '27.08' }]);
    expect(summary).toMatchObject({ texts: [], buyer: null, reverseCharge: false });
  });
});

describe('inventoryDifferences', () => {
  const moves = [{ id: 'a', kind: 'RECEIPT', date: '2026-10-01', warehouseId: 'w1', itemId: 'i1', qty: '10' }];

  it('turns differences into adjustments and keeps matches', () => {
    const rows = inventoryDifferences(moves, { warehouseId: 'w1', date: '2026-10-18', counts: { i1: '8', i2: '0' } });
    expect(rows[0]).toMatchObject({ itemId: 'i1', book: '10', counted: '8', difference: '-2', move: { kind: 'ADJUSTMENT', qty: '-2', warehouseId: 'w1', date: '2026-10-18' } });
    expect(rows[1]).toMatchObject({ itemId: 'i2', difference: '0', move: null });
    expect(hasShortage(rows)).toBe(true);
  });

  it('refuses a negative count', () => {
    expect(() => inventoryDifferences(moves, { warehouseId: 'w1', date: '2026-10-18', counts: { i1: '-1' } })).toThrow(expect.objectContaining({ code: 'STOCK_COUNT_INVALID' }));
  });
});

describe('stockCsv', () => {
  it('writes semicolon CSV with a BOM, decimal commas and quoted fields', () => {
    const csv = stockCsv([{ id: 'name', label: 'Názov' }, { id: 'qty', label: 'Množstvo' }], [{ name: 'Farba; biela', qty: '2.5' }, { name: '=SUM(A1)', qty: '-1' }]);
    expect(csv).toBe(String.fromCharCode(0xfeff) + 'Názov;Množstvo\r\n"Farba; biela";2,5\r\n\'=SUM(A1);-1\r\n');
  });
});
