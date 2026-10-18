// Sales list logic: routes and hashes, rows, filters, totals, series.
import { describe, it, expect } from 'vitest';
import { LIST_ROUTES, SALES_KINDS, routeForKind, parseSalesHash, salesHash, isSalesKind } from './kinds.js';
import { documentRow, documentRows, filterRows, sumByCurrency, byNewest, dashboardDocument, fold } from './rows.js';
import { defaultSeries, resolveSeries, withSeries, takenNumbers, previewNumber, previewVs, maskError, setNextCounter, nextCounterOf, seriesOfKind } from './series.js';
import { newDraft } from '../editor/draft.js';
import { COMPANY, CONTACT } from './fixtures.js';

const TODAY = '2026-10-18';
const contact = { ...CONTACT, id: 'c1' };

function issued(over = {}) {
  const doc = newDraft({ kind: 'INVOICE', company: COMPANY, contact, today: '2026-10-01', id: over.id || 'd1' });
  doc.lines[0] = { ...doc.lines[0], name: 'Work', qty: '2', unitPrice: '100' };
  return { ...doc, status: 'ISSUED', number: 'FA20260001', seriesId: 's1', ...over };
}

describe('sales routes', () => {
  it('maps every sales kind to one list', () => {
    expect(new Set(SALES_KINDS).size).toBe(SALES_KINDS.length);
    expect(routeForKind('INVOICE')).toBe('invoices');
    expect(routeForKind('ADVANCE_TAX_DOC')).toBe('invoices');
    expect(routeForKind('DEBIT_NOTE')).toBe('credit-notes');
    expect(routeForKind('ORDER_OUT')).toBe('orders');
    expect(routeForKind('RECEIVED_INVOICE')).toBeNull();
    expect(isSalesKind('EXPENSE_RECEIPT')).toBe(false);
    expect(Object.keys(LIST_ROUTES)).toEqual(['invoices', 'proformas', 'credit-notes', 'quotes', 'orders', 'delivery-notes']);
  });

  it('parses and builds the hashes of the screens', () => {
    expect(parseSalesHash('#/invoices')).toEqual({ route: 'invoices', id: null, mode: 'list', params: {} });
    expect(parseSalesHash('#/invoices/new?contact=c1&kind=INVOICE')).toEqual({ route: 'invoices', id: null, mode: 'new', params: { contact: 'c1', kind: 'INVOICE' } });
    expect(parseSalesHash('#/quotes/abc')).toMatchObject({ id: 'abc', mode: 'view' });
    expect(parseSalesHash('#/quotes/abc/edit')).toMatchObject({ id: 'abc', mode: 'edit' });
    expect(salesHash('invoices', { mode: 'new', params: { contact: 'c1', kind: '' } })).toBe('#/invoices/new?contact=c1');
    expect(salesHash('invoices', { id: 'x y', mode: 'edit' })).toBe('#/invoices/x%20y/edit');
    expect(parseSalesHash(salesHash('orders', { id: 'x y' }))).toMatchObject({ id: 'x y', mode: 'view' });
  });
});

describe('document rows', () => {
  const ctx = { contacts: new Map([['c1', contact]]), company: { ...COMPANY, id: 'co' }, today: TODAY };

  it('derives amounts, status and payment state from the core', () => {
    const row = documentRow(issued({ dueDate: '2026-10-10' }), ctx);
    expect(row).toMatchObject({ number: 'FA20260001', contactName: 'Beta a. s.', net: '200.00', vat: '46.00', gross: '246.00', payable: '246.00', paid: '0.00', due: '246.00', status: 'OVERDUE', paymentState: 'UNPAID' });
    expect(row.peppol.requirement).toBe('OPTIONAL');
    const paid = documentRow(issued({ payments: [{ id: 'p', date: TODAY, amount: '246.00', currency: 'EUR', method: 'TRANSFER', source: 'MANUAL' }] }), ctx);
    expect(paid).toMatchObject({ status: 'PAID', paymentState: 'PAID', due: '0.00' });
  });

  it('marks eFaktura as mandatory for a domestic B2B supply from 2027', () => {
    const row = documentRow(issued({ issueDate: '2027-01-05', taxDate: '2027-01-05' }), { ...ctx, today: '2027-01-06' });
    expect(row.peppol.requirement).toBe('MANDATORY');
    const czech = documentRow(issued({ issueDate: '2027-01-05', taxDate: '2027-01-05' }), { ...ctx, company: { ...ctx.company, address: { ...COMPANY.address, country: 'CZ' } }, today: '2027-01-06' });
    expect(czech.peppol.requirement).not.toBe('MANDATORY');
    expect(documentRow({ ...issued(), status: 'DRAFT' }, ctx).peppol).toBeNull();
  });

  it('keeps a draft that cannot be computed yet in the list', () => {
    const doc = issued({ status: 'DRAFT', number: null });
    doc.lines[0] = { ...doc.lines[0], vatRate: null };
    expect(documentRow(doc, ctx)).toMatchObject({ gross: '0.00', status: 'DRAFT' });
  });

  it('reads the demo summaries as they are', () => {
    const row = documentRow({ id: 'x', kind: 'INVOICE', number: 'FA1', status: 'PARTIALLY_PAID', issueDate: TODAY, contactName: 'Demo', totalNet: '100.00', totalVat: '23.00', totalGross: '123.00', paidAmount: '50.00' }, ctx);
    expect(row).toMatchObject({ gross: '123.00', due: '73.00', paymentState: 'PARTIAL', status: 'PARTIALLY_PAID' });
  });

  it('filters by period, status, client, label, currency, payment and query', () => {
    const rows = documentRows([
      issued({ id: 'a', number: 'FA20260001', tags: ['web'] }),
      issued({ id: 'b', number: 'FA20260002', issueDate: '2025-05-01', buyer: { name: 'Kováč' } }),
      issued({ id: 'c', number: null, status: 'DRAFT', issueDate: null }),
      issued({ id: 'd', number: 'FA20260003', currency: 'CZK', fxRate: '25' })
    ], ctx);
    const ids = (f) => filterRows(rows, f).map(r => r.id);
    expect(ids({ from: '2026-01-01', to: '2026-12-31' })).toEqual(['a', 'c', 'd']);
    expect(ids({ status: 'DRAFT' })).toEqual(['c']);
    expect(ids({ contact: 'kovac' })).toEqual(['b']);
    expect(ids({ label: 'WEB' })).toEqual(['a']);
    expect(ids({ currency: 'CZK' })).toEqual(['d']);
    expect(ids({ payment: 'unpaid' })).toEqual(['a', 'b', 'd']);
    expect(ids({ query: '0002' })).toEqual(['b']);
    expect(fold('Žltý Kôň')).toBe('zlty kon');
  });

  it('sums per currency without cancelled documents and sorts newest first', () => {
    const rows = documentRows([issued({ id: 'a' }), issued({ id: 'b', currency: 'CZK', fxRate: '25' }), issued({ id: 'c', status: 'CANCELLED' }), issued({ id: 'e' })], ctx);
    expect(sumByCurrency(rows, 'gross')).toEqual([{ currency: 'EUR', amount: '492.00' }, { currency: 'CZK', amount: '246.00' }]);
    const sorted = [{ issueDate: '2026-01-01', number: 'A' }, { issueDate: null, number: null }, { issueDate: '2026-02-01', number: 'B' }].sort(byNewest);
    expect(sorted.map(r => r.number)).toEqual([null, 'B', 'A']);
  });

  it('gives the dashboard the fields it reads', () => {
    expect(dashboardDocument(documentRow(issued(), ctx))).toMatchObject({ kind: 'INVOICE', totalNet: '200.00', totalGross: '246.00', paidAmount: '0.00', contactName: 'Beta a. s.' });
  });
});

describe('series', () => {
  it('creates a default series per kind on first use, corrections apart', () => {
    const created = resolveSeries({ series: [] }, 'INVOICE', null, 'new');
    expect(created).toMatchObject({ created: true, series: { id: 'new', mask: 'FA{YYYY}{N:4}', reset: 'YEARLY', isDefault: true } });
    expect(defaultSeries('CREDIT_NOTE').mask).toBe('DB{YYYY}{N:4}');
    const company = { series: [{ ...defaultSeries('INVOICE', { id: 'a' }), isDefault: false }, defaultSeries('INVOICE', { id: 'b' })] };
    expect(seriesOfKind(company, 'INVOICE').map(s => s.id)).toEqual(['b', 'a']);
    expect(resolveSeries(company, 'INVOICE', 'a').series.id).toBe('a');
    expect(resolveSeries(company, 'INVOICE', 'gone').series.id).toBe('b');
  });

  it('keeps one default per kind when a series is saved', () => {
    const company = { series: [defaultSeries('INVOICE', { id: 'a' }), defaultSeries('QUOTE', { id: 'q' })] };
    const next = withSeries(company, defaultSeries('INVOICE', { id: 'b' }));
    expect(next.map(s => [s.id, s.isDefault])).toEqual([['a', false], ['q', true], ['b', true]]);
  });

  it('previews the next number and skips taken ones', () => {
    const s = defaultSeries('INVOICE', { id: 's1' });
    const taken = takenNumbers([{ seriesId: 's1', number: 'FA20260001' }, { seriesId: 's1', number: 'FA20260002', deleted: true }, { seriesId: 'x', number: 'FA20260003' }], 's1');
    expect([...taken]).toEqual(['FA20260001']);
    expect(previewNumber(s, TODAY, taken)).toBe('FA20260002');
    expect(previewVs({ ...s, vsMask: '{YY}{N:6}' }, TODAY, taken)).toBe('26000002');
    expect(previewNumber({ ...s, mask: 'FA' }, TODAY)).toBeNull();
  });

  it('checks masks and the manual next counter', () => {
    expect(maskError('FA{YYYY}{N:4}', TODAY)).toBeNull();
    expect(maskError('FA{YYYY}', TODAY)).toBe('SERIES_MASK_INVALID');
    const s = defaultSeries('INVOICE', { id: 's1' });
    expect(nextCounterOf(s, TODAY)).toBe(1);
    const set = setNextCounter(s, TODAY, 7);
    expect(set.error).toBeNull();
    expect(set.series.counters).toEqual({ 2026: 7 });
    expect(nextCounterOf(set.series, TODAY)).toBe(7);
    expect(setNextCounter(s, TODAY, 3, ['FA20260003']).error).toBe('SERIES_NUMBER_TAKEN');
    expect(setNextCounter(s, TODAY, 0).error).toBe('SERIES_COUNTER_INVALID');
    expect(previewNumber({ ...s, counters: { 2026: 12 } }, '2027-01-02')).toBe('FA20270001');
  });
});
