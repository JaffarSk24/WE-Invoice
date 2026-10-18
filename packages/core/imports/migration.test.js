// Migration from other programs with the files in tests/fixtures/imports
// and the round trips through our own exports (Pohoda XML, Omega text).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { company, contacts, documents, period } from '../../../tests/fixtures/exports/period.js';
import { importIdoklad, importSuperfaktura, importKros, importCsv } from './programs.js';
import { importPohoda } from './pohoda.js';
import { readCsv } from './csv.js';
import { exportPohoda } from '../exports/pohoda.js';
import { exportOmega } from '../exports/omega.js';
import { decodeWindows1250 } from '../exports/encoding.js';
import { computeTotals } from '../vat/index.js';

const fixture = (name) => readFileSync(new URL(`../../../tests/fixtures/imports/${name}`, import.meta.url), 'utf8');
const payable = (d) => computeTotals(d).payable;

describe('iDoklad', () => {
  const result = importIdoklad([{ name: 'faktury.csv', rows: readCsv(fixture('idoklad-vydane-faktury.csv')) }], { company });

  it('reads invoices from the totals, with the rate derived from VAT', () => {
    expect(result.documents.map(d => d.number)).toEqual(['FV2025001', 'FV2025002', 'FV2025003']);
    const [first, second, third] = result.documents;
    expect(first.lines).toHaveLength(1);
    expect(first.lines[0]).toMatchObject({ unitPrice: '1000', vatCategory: 'S', vatRate: '23' });
    expect(payable(first)).toBe('1230.00');
    expect(second.lines[0]).toMatchObject({ vatCategory: 'O', vatRate: null });
    expect(third.lines[0].vatRate).toBe('19');
    expect(first.seller.ico).toBe('12345679');
    expect(first.buyer).toMatchObject({ name: 'Odběratel Praha s.r.o.', ico: '27082440', icDph: 'CZ27082440', address: { country: 'CZ' } });
  });

  it('brings the payments with their dates', () => {
    expect(result.documents[0].payments).toEqual([expect.objectContaining({ date: '2025-11-20', amount: '1230', method: 'TRANSFER', source: 'MANUAL' })]);
    expect(result.documents[1].payments).toEqual([]);
  });

  it('reports the row without a number and the derived rates', () => {
    expect(result.report.skipped).toEqual([{ entity: 'documents', ref: '#5', reason: 'MISSING_NUMBER' }]);
    expect(result.report.warnings.map(w => w.code)).toContain('RATE_DERIVED');
  });

  it('reads an ISDOC file of iDoklad as an issued document', () => {
    const isdoc = readFileSync(new URL('../../../tests/fixtures/isdoc/invoice-eur.isdoc', import.meta.url), 'utf8');
    const r = importIdoklad([{ name: 'FA.isdoc', text: isdoc }], {});
    expect(r.documents[0]).toMatchObject({ kind: 'INVOICE', number: 'FA2026001' });
  });
});

describe('SuperFaktúra', () => {
  it('groups the rows of one invoice into its lines', () => {
    const result = importSuperfaktura([{ name: 'sf.csv', rows: readCsv(fixture('superfaktura-faktury.csv')) }], { company });
    expect(result.documents.map(d => [d.number, d.lines.length])).toEqual([['2025-0101', 2], ['2025-0102', 1]]);
    const first = result.documents[0];
    expect(first.lines.map(l => [l.name, l.qty, l.unit, l.unitPrice, l.vatRate])).toEqual([
      ['Káva zrnková 1 kg', '3', { code: 'H87', label: 'ks' }, '18.5', '23'],
      ['Školenie baristov', '2', { code: 'HUR', label: 'hod' }, '40', '23']
    ]);
    expect(payable(first)).toBe('166.67');
    expect(result.contacts.map(c => c.ico)).toEqual(['44556677', '35757442']);
  });

  it('reads its Pohoda XML export', () => {
    const xml = exportPohoda({ company, contacts, documents }, period).content;
    expect(importSuperfaktura(xml, { company }).documents).toHaveLength(4);
  });
});

describe('KROS', () => {
  it('reads the address book list', () => {
    const result = importKros([{ name: 'adresar.csv', rows: readCsv(fixture('kros-adresar.csv')) }]);
    expect(result.contacts.map(c => [c.name, c.ico, c.icDph, c.country, c.dueDays, c.emails.length])).toEqual([
      ['Dodávateľ, s. r. o.', '44556677', 'SK2022000018', 'SK', 30, 1],
      ['Odberateľ, a. s.', '35757442', 'SK2021000011', 'SK', 14, 1]
    ]);
    expect(result.report.skipped).toEqual([{ entity: 'contacts', ref: '#4', reason: 'MISSING_NAME' }]);
  });

  it('round-trips the Omega text format', () => {
    const files = exportOmega({ company, documents }, period).files;
    const issued = importKros([{ name: files[0].name, text: decodeWindows1250(files[0].data) }], { company });
    expect(issued.documents.map(d => d.number)).toEqual(['FA2026001', 'FA2026002', 'DB2026001']);
    expect(issued.documents.map(payable)).toEqual(['652.80', payable(documents[2]), payable(documents[1])]);
    const received = importKros([{ name: files[1].name, text: decodeWindows1250(files[1].data) }], { company });
    expect(received.documents[0]).toMatchObject({ kind: 'RECEIVED_INVOICE', number: '2026/0815' });
  });

  it('refuses a file it does not know', () => {
    expect(() => importKros([{ name: 'x.bin', text: 'PK binary' }])).toThrow(expect.objectContaining({ code: 'IMPORT_FORMAT_UNKNOWN' }));
  });
});

describe('Pohoda XML', () => {
  it('reads back what exportPohoda wrote, with equal totals', () => {
    const xml = exportPohoda({ company, contacts, documents }, { ...period, includeContacts: true }).content;
    const result = importPohoda(xml, { company });
    const byNumber = new Map(result.documents.map(d => [d.number, d]));
    ['FA2026001', 'DB2026001', '2026/0815', 'FA2026002'].forEach(n => {
      expect(payable(byNumber.get(n))).toBe(payable(documents.find(d => d.number === n)));
    });
    expect(byNumber.get('2026/0815')).toMatchObject({ kind: 'RECEIVED_INVOICE', seller: { ico: '44556677' } });
    expect(result.contacts.filter(c => c.ico === '35757442').length).toBeGreaterThan(0);
  });

  it('takes the rate of a Pohoda rate name from legislation on the document date', () => {
    const xml = `<dat:dataPack xmlns:dat="d" xmlns:inv="i" xmlns:typ="t"><dat:dataPackItem><inv:invoice><inv:invoiceHeader>
      <inv:invoiceType>issuedInvoice</inv:invoiceType><inv:number><typ:numberRequested>X1</typ:numberRequested></inv:number>
      <inv:date>2024-06-01</inv:date></inv:invoiceHeader><inv:invoiceDetail><inv:invoiceItem><inv:text>A</inv:text><inv:quantity>1</inv:quantity>
      <inv:payVAT>true</inv:payVAT><inv:rateVAT>high</inv:rateVAT><inv:homeCurrency><typ:unitPrice>120</typ:unitPrice></inv:homeCurrency>
      </inv:invoiceItem></inv:invoiceDetail></inv:invoice></dat:dataPackItem></dat:dataPack>`;
    const [doc] = importPohoda(xml).documents;
    expect(doc.lines[0]).toMatchObject({ vatRate: '20', priceType: 'GROSS' });
    expect(payable(doc)).toBe('120.00');
  });

  it('makes lines from the summary of an invoice without items', () => {
    const xml = `<a><invoice><invoiceHeader><invoiceType>issuedInvoice</invoiceType><number><numberRequested>S1</numberRequested></number>
      <date>2026-03-01</date></invoiceHeader><invoiceSummary><homeCurrency><priceNone>10</priceNone><priceHigh>100</priceHigh><priceHighVAT>23</priceHighVAT></homeCurrency></invoiceSummary></invoice></a>`;
    const result = importPohoda(xml);
    expect(payable(result.documents[0])).toBe('133.00');
    expect(result.report.warnings).toEqual([{ entity: 'documents', ref: 'S1', code: 'LINES_FROM_SUMMARY' }]);
  });
});

describe('generic CSV', () => {
  it('takes a mapping the user set', () => {
    const text = 'a;b;c\nCena;Tovar;Kód\n12,50;Pero;P1\n';
    const result = importCsv(text, { price: 0, name: 1, code: 2 }, { entity: 'items', headerRow: 1 });
    expect(result.items).toEqual([expect.objectContaining({ name: 'Pero', code: 'P1', price: '12.5', priceType: 'NET', vatCategory: 'O' })]);
  });
});
