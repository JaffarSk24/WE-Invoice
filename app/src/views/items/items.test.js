// The price list as data: item checks, both prices, search, the CSV
// import and the section registry for other packages.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { normalizeItem, bothPrices, searchItems, categoriesOf, itemToLine, decimalText } from './model.js';
import { parseCsv, importItems, unitFrom, mapHeader } from './csv.js';
import { registerItemSection, itemSections, renderItemSections, resetItemSections } from './sections.js';

describe('normalizeItem', () => {
  it('accepts a comma decimal and reports missing fields', () => {
    expect(normalizeItem({ name: 'Konzultácia', price: '50,5', vatRate: '23' })).toMatchObject({ item: { price: '50.5', vatCategory: 'S', vatRate: '23' }, errors: {} });
    expect(normalizeItem({ name: '', price: 'abc', vatRate: '', unit: { code: '' } }).errors).toEqual({ name: 'NAME_REQUIRED', price: 'PRICE_INVALID', vatRate: 'VAT_RATE_INVALID', unit: 'UNIT_REQUIRED' });
  });
  it('drops the rate outside category S', () => {
    expect(normalizeItem({ name: 'Export', price: '10', vatCategory: 'G', vatRate: '23' }).item.vatRate).toBe(null);
    expect(decimalText(' 1 234,50 ')).toBe('1234.50');
  });
});

describe('bothPrices', () => {
  it('computes the other price from the VAT rate', () => {
    expect(bothPrices({ price: '100', priceType: 'NET', vatCategory: 'S', vatRate: '23' })).toEqual({ net: '100.00', gross: '123.00' });
    expect(bothPrices({ price: '123', priceType: 'GROSS', vatCategory: 'S', vatRate: '23' })).toEqual({ net: '100.00', gross: '123.00' });
    expect(bothPrices({ price: '10', priceType: 'GROSS', vatCategory: 'S', vatRate: '19' })).toEqual({ net: '8.40', gross: '10.00' });
    expect(bothPrices({ price: '10', priceType: 'NET', vatCategory: 'E', vatRate: null })).toEqual({ net: '10.00', gross: '10.00' });
  });
});

describe('search and lines', () => {
  const items = [{ id: '1', name: 'Údržba webu', code: 'WEB', accountingCategory: 'Služby' }, { id: '2', name: 'Kábel', barcode: '858000', accountingCategory: 'Tovar' }];
  it('searches folded text and filters by category', () => {
    expect(searchItems(items, 'udrz').map(i => i.id)).toEqual(['1']);
    expect(searchItems(items, '8580').map(i => i.id)).toEqual(['2']);
    expect(searchItems(items, '', 'Tovar').map(i => i.id)).toEqual(['2']);
    expect(categoriesOf(items)).toEqual(['Služby', 'Tovar']);
  });
  it('turns an item into a document line', () => {
    const line = itemToLine({ id: 'i', name: 'X', price: '5', priceType: 'NET', vatCategory: 'S', vatRate: '23', unit: { code: 'HUR', label: '' } }, 'l1');
    expect(line).toMatchObject({ id: 'l1', itemId: 'i', qty: '1', unitPrice: '5', vatRate: '23', unit: { code: 'HUR' } });
  });
});

describe('CSV import', () => {
  it('parses quotes, separators and a BOM', () => {
    expect(parseCsv('\ufeffa;b\n"x;1";"he said ""hi"""\r\n\n')).toEqual([['a', 'b'], ['x;1', 'he said "hi"']]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('recognises Slovak, Czech and English column names', () => {
    expect(mapHeader(['Názov', 'Cena s DPH', 'MJ', 'Sadzba DPH'])).toEqual({ name: 0, gross: 1, unit: 2, vatRate: 3 });
    expect(mapHeader(['Name', 'Price', 'Unit'])).toEqual({ name: 0, net: 1, unit: 2 });
  });

  it('maps units', () => {
    expect(unitFrom('hod.')).toEqual({ code: 'HUR', label: 'hod.' });
    expect(unitFrom('KGM')).toEqual({ code: 'KGM', label: '' });
    expect(unitFrom('balenie')).toEqual({ code: 'C62', label: 'balenie' });
  });

  it('imports valid rows and reports the others by line number', () => {
    const csv = 'Názov;Kód;Cena bez DPH;DPH;MJ;Kategória\nKonzultácia;K1;50,00;23;hod;Služby\n;K2;10;23;ks;\nKniha;K3;abc;5;ks;\nPoistenie;K4;30;0;ks;';
    const { items, errors } = importItems(csv);
    expect(items.map(i => i.name)).toEqual(['Konzultácia', 'Poistenie']);
    expect(items[0]).toMatchObject({ code: 'K1', price: '50.00', priceType: 'NET', vatRate: '23', unit: { code: 'HUR' }, accountingCategory: 'Služby' });
    expect(items[1]).toMatchObject({ vatCategory: 'E', vatRate: null });
    expect(errors).toEqual([{ row: 3, field: 'name', code: 'NAME_REQUIRED' }, { row: 4, field: 'price', code: 'PRICE_INVALID' }]);
  });

  it('refuses a file without the needed columns', () => {
    expect(importItems('foo;bar\n1;2').errors).toEqual([{ row: 1, field: 'header', code: 'CSV_COLUMNS' }]);
    expect(importItems('').errors[0].code).toBe('CSV_EMPTY');
  });
});

describe('item sections', () => {
  beforeEach(() => resetItemSections());
  it('lets other packages add sections in order and isolates failures', () => {
    const calls = [];
    registerItemSection((box, ctx) => calls.push(['stock', ctx.item.id]), { id: 'stock', order: 20 });
    registerItemSection(() => { throw new Error('boom'); }, { id: 'broken', order: 10 });
    const off = registerItemSection(() => calls.push(['levels']), { id: 'levels', order: 30 });
    expect(itemSections().map(s => s.id)).toEqual(['broken', 'stock', 'levels']);
    off();
    const host = { children: [], append(x) { this.children.push(x); } };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderItemSections(host, { item: { id: 'i1' } }, (id) => ({ id }));
    expect(calls).toEqual([['stock', 'i1']]);
    expect(host.children.map(c => c.id)).toEqual(['broken', 'stock']);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    expect(() => registerItemSection(null)).toThrow();
  });
});
