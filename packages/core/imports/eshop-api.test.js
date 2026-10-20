// Shoptet orders (XML and CSV) and the SuperFaktúra API answers, through
// the import plan: drafts or received orders, contacts, price list items
// linked by product code, duplicates by order code, and the API's paging,
// details and errors.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { importShoptet } from './shoptet.js';
import {
  sfAuthorization, sfListPath, sfDetailsPath, readSfPage, readSfDetails, sfError, importSuperfakturaApi, SF_MARKETS
} from './superfaktura-api.js';
import { buildImportPlan, applyImportPlan } from './plan.js';
import { computeTotals } from '../vat/index.js';
import { emptyCompanyData } from '../schema/empty.js';
import { company } from '../../../tests/fixtures/exports/period.js';

const text = (name) => readFileSync(new URL(`../../../tests/fixtures/imports/${name}`, import.meta.url), 'utf8');
const json = (name) => JSON.parse(text(`superfaktura-api/${name}`));
const payable = (d) => computeTotals(d).payable;

describe('Shoptet orders', () => {
  it('turn into draft invoices with the order totals, customers and products', () => {
    const r = importShoptet(text('shoptet/orders.xml'), { company });
    expect(r.documents.map(d => [d.orderReference, d.kind, d.status, d.number, payable(d), d.paymentMethod])).toEqual([
      ['2026000101', 'INVOICE', 'DRAFT', null, '54.12', 'TRANSFER'],
      ['2026000102', 'INVOICE', 'DRAFT', null, '34.05', 'CARD'],
      ['2026000104', 'INVOICE', 'DRAFT', null, '1210.00', 'TRANSFER']
    ]);
    const first = r.documents[0];
    expect(first.buyer).toMatchObject({ name: 'Kaviareň u Moniky, s. r. o.', ico: '44556677', icDph: 'SK2022000018', address: { street: 'Štúrova 1', city: 'Žilina', country: 'SK' } });
    expect(first.lines.map(l => [l.name, l.qty, l.unitPrice, l.priceType, l.vatRate, l.itemCode])).toEqual([
      ['Káva zrnková, 1 kg', '2', '22.14', 'GROSS', '23', 'KAVA-1KG'],
      ['Kuriér', '1', '4.92', 'GROSS', '23', null],
      ['Bankový prevod', '1', '4.92', 'GROSS', '23', null]
    ]);
    expect(r.documents[2]).toMatchObject({ currency: 'CZK', fxRate: '25.12' });
    expect(r.items.map(i => i.code)).toEqual(['KAVA-1KG', 'KNIHA-01', 'KAVA-250', 'MLYN-01']);
    expect(r.contacts.find(c => c.ico === '44556677').note).toBe('Jana Nováková');
    expect(r.report.skipped).toEqual([{ entity: 'documents', ref: '2026000103', reason: 'ORDER_CANCELLED' }]);
  });

  it('turn into received orders numbered by the order code', () => {
    const r = importShoptet(text('shoptet/orders.xml'), { company, target: 'ORDER_IN', addItems: false });
    expect(r.documents.map(d => [d.kind, d.status, d.number])).toEqual([['ORDER_IN', 'ISSUED', '2026000101'], ['ORDER_IN', 'ISSUED', '2026000102'], ['ORDER_IN', 'ISSUED', '2026000104']]);
    expect(r.items).toEqual([]);
  });

  it('read the CSV export with one row per item', () => {
    const r = importShoptet(text('shoptet/orders.csv'), { company });
    expect(r.documents).toHaveLength(1);
    expect(r.documents[0]).toMatchObject({ orderReference: '2026000201', paymentMethod: 'COD', buyer: { ico: '35757442' } });
    expect(payable(r.documents[0])).toBe('67.92');
    expect(r.report.skipped).toEqual([{ entity: 'documents', ref: '2026000202', reason: 'ORDER_CANCELLED' }]);
  });

  it('warn when the lines do not give the order total', () => {
    const xml = text('shoptet/orders.xml').replace('<WITH_VAT>54.12</WITH_VAT>', '<WITH_VAT>60.00</WITH_VAT>');
    expect(importShoptet(xml, { company }).report.warnings).toContainEqual({ entity: 'documents', ref: '2026000101', code: 'TOTALS_MISMATCH' });
  });

  it('come in once: an order already imported is skipped, lines link to the price list', () => {
    const parsed = importShoptet(text('shoptet/orders.xml'), { company });
    const existingItem = { id: 'item-1', name: 'Káva', code: 'kava-1kg', price: '18', priceType: 'NET', vatCategory: 'S', vatRate: '23' };
    const invoiced = { id: 'd', kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', number: 'FA1', orderReference: '2026000102', buyer: {}, lines: [] };
    const plan = buildImportPlan(parsed, { contacts: [], items: [existingItem], documents: [invoiced] });
    expect(plan.documents.map(p => p.draft.orderReference)).toEqual(['2026000101', '2026000104']);
    expect(plan.report.skipped).toContainEqual({ entity: 'documents', ref: '2026000102', reason: 'DUPLICATE_ORDER' });
    expect(plan.report.skipped).toContainEqual({ entity: 'items', ref: 'KAVA-1KG', reason: 'DUPLICATE_ITEM' });
    let n = 0;
    const data = { ...emptyCompanyData({ company, now: 'T', schemaVersion: 1 }), items: [existingItem], documents: [invoiced] };
    const { data: next } = applyImportPlan(data, plan, { now: 'N', newId: () => `id-${++n}` });
    const first = next.documents.find(d => d.orderReference === '2026000101');
    expect(first.lines[0]).toMatchObject({ itemId: 'item-1' });
    expect(first.lines[0].itemCode).toBeUndefined();
    const mlyn = next.items.find(i => i.code === 'MLYN-01');
    expect(next.documents.find(d => d.orderReference === '2026000104').lines[0].itemId).toBe(mlyn.id);
    const again = buildImportPlan(importShoptet(text('shoptet/orders.xml'), { company }), next);
    expect(again.report.added.documents).toBe(0);
  });
});

describe('SuperFaktúra API', () => {
  it('builds the authorization header and the paged paths of its own client', () => {
    expect(sfAuthorization({ email: 'jana@example.sk', apiKey: 'abc 123', companyId: 7 })).toBe('SFAPI email=jana%40example.sk&apikey=abc+123&company_id=7&module=WE+Invoice');
    expect(() => sfAuthorization({ email: '', apiKey: 'x' })).toThrow(expect.objectContaining({ code: 'SF_CREDENTIALS_MISSING' }));
    expect(sfListPath('clients', 2)).toBe('/clients/index.json/listinfo:1/page:2/per_page:100');
    expect(sfListPath('items', 1)).toBe('/stock_items/index.json/listinfo:1/page:1/per_page:100');
    expect(sfDetailsPath(['501', 502, 'x'])).toBe('/invoices/getInvoiceDetails/501,502');
    expect(SF_MARKETS.sk).toBe('https://moja.superfaktura.sk');
  });

  it('reads pages, details and error answers', () => {
    expect(readSfPage(json('clients-page-1.json'))).toMatchObject({ page: 1, pageCount: 2, itemCount: 3 });
    expect(readSfPage([{ a: 1 }])).toMatchObject({ pageCount: 1, records: [{ a: 1 }] });
    expect(readSfDetails(json('invoice-details.json')).map(r => r.Invoice.id)).toEqual(['501', '502', '503']);
    expect(sfError(json('error-unauthorized.json'))).toMatchObject({ code: 'SF_UNAUTHORIZED' });
    expect(() => readSfPage(json('error-unauthorized.json'))).toThrow(expect.objectContaining({ code: 'SF_UNAUTHORIZED' }));
    expect(() => readSfPage({ nothing: true })).toThrow(expect.objectContaining({ code: 'SF_ANSWER_UNREADABLE' }));
  });

  it('turns clients, items and invoices into drafts with payments', () => {
    const clients = [...readSfPage(json('clients-page-1.json')).records, ...readSfPage(json('clients-page-2.json')).records];
    const r = importSuperfakturaApi({ clients, items: readSfPage(json('stock-items.json')).records, invoices: readSfDetails(json('invoice-details.json')) }, { company });
    expect(r.contacts.slice(0, 2).map(c => [c.name, c.ico, c.icDph, c.country, c.dueDays, c.currency])).toEqual([
      ['Kaviareň u Moniky, s. r. o.', '44556677', 'SK2022000018', 'SK', 14, 'EUR'],
      ['Česká kavárna s.r.o.', '27082440', 'CZ27082440', 'CZ', null, 'CZK']
    ]);
    expect(r.report.skipped).toContainEqual({ entity: 'contacts', ref: '103', reason: 'MISSING_NAME' });
    expect(r.items.map(i => [i.name, i.code, i.price, i.vatRate, i.stockTracked])).toEqual([['Káva zrnková 1 kg', 'KAVA-1KG', '18', '23', true], ['Školenie baristov', null, '40', '23', false]]);
    const [inv, credit, czk] = r.documents;
    expect(inv).toMatchObject({ kind: 'INVOICE', number: '2026001', issueDate: '2026-09-02', taxDate: '2026-09-01', dueDate: '2026-09-16', vs: '2026001', ks: '0308', orderReference: 'OBJ-77' });
    expect(payable(inv)).toBe('110.70');
    expect(inv.payments).toEqual([expect.objectContaining({ date: '2026-09-10', amount: '110.7', method: 'TRANSFER' })]);
    expect(inv.lines[1]).toMatchObject({ qty: '1.5', discountPct: '10', itemCode: null });
    expect(credit).toMatchObject({ kind: 'CREDIT_NOTE', number: 'D2026001' });
    expect(czk).toMatchObject({ currency: 'CZK', fxRate: '25.12', paymentMethod: 'CASH' });
    expect(czk.lines[0]).toMatchObject({ vatCategory: 'Z', vatRate: null });
  });
});

describe('Shoptet spreadsheet export', () => {
  it('reads rows of an XLSX or XLS file like the CSV', async () => {
    const { readCsv } = await import('./csv.js');
    const r = importShoptet(readCsv(text('shoptet/orders.csv')), { company });
    expect(r.documents.map(d => d.orderReference)).toEqual(['2026000201']);
  });
});
