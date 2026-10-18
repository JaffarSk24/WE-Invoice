// Export formats against the month in tests/fixtures/exports/period.js:
// what goes in (period, drafts, cancelled), the figures per VAT rate, the
// structure each program reads and the safety of CSV cells.
import { describe, it, expect } from 'vitest';
import { company, contacts, documents, period } from '../../../tests/fixtures/exports/period.js';
import { exportCsv, protectCell } from './csv.js';
import { exportPohoda } from './pohoda.js';
import { exportMoneyS3 } from './money-s3.js';
import { exportOmega, OMEGA_HEADER } from './omega.js';
import { exportWeBudgetCsv } from './webudget.js';
import { selectDocuments, breakdownByCode, documentTotals, rateCode } from './period.js';
import { decodeWindows1250 } from './encoding.js';
import { parseXml, descendants, textAt, at } from '../imports/xml.js';

const data = { company, contacts, documents };

describe('period selection', () => {
  it('takes the documents of the month by tax date, without drafts, oldest first', () => {
    const numbers = selectDocuments(documents, period).map(d => d.number);
    expect(numbers).toEqual(['FA2026001', '2026/0815', 'FA2026002', 'DB2026001', 'BL-77']);
  });

  it('can leave cancelled documents out', () => {
    const cancelled = [...documents, { ...documents[0], id: 'x', number: 'FA2026099', status: 'CANCELLED' }];
    expect(selectDocuments(cancelled, { ...period, includeCancelled: false }).map(d => d.number)).not.toContain('FA2026099');
    expect(selectDocuments(cancelled, period).map(d => d.number)).toContain('FA2026099');
  });

  it('groups the VAT breakdown by legislation code', () => {
    const b = breakdownByCode(documentTotals(documents[0]), '2026-09-01');
    expect(b.STANDARD).toEqual({ base: '500.00', vat: '115.00' });
    expect(b.REDUCED_2).toEqual({ base: '36.00', vat: '1.80' });
    expect(rateCode('19', '2026-09-01')).toBe('REDUCED_1');
    expect(rateCode('20', '2026-09-01')).toBeNull();
    expect(rateCode('20', '2024-06-01')).toBe('STANDARD');
  });
});

describe('CSV', () => {
  it('protects cells a spreadsheet would run as a formula, but not negative numbers', () => {
    expect(protectCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(protectCell('+421 900')).toBe("'+421 900");
    expect(protectCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(protectCell('-12.50')).toBe('-12.50');
    expect(protectCell('-x')).toBe("'-x");
  });

  it('quotes delimiters, quotes and line breaks and writes CRLF with a BOM', () => {
    const text = exportCsv([{ a: 'x;y', b: 'say "hi"\nnow' }], [{ key: 'a', header: 'A' }, { key: 'b', header: 'B' }]);
    expect(text).toBe('\ufeffA;B\r\n"x;y";"say ""hi""\nnow"\r\n');
  });

  it('writes decimal commas on request', () => {
    expect(exportCsv([{ v: '12.50' }], [{ key: 'v', header: 'V' }], { decimalComma: true, bom: false })).toBe('V\r\n12,50\r\n');
  });
});

describe('Pohoda XML', () => {
  const result = exportPohoda(data, { ...period, includeContacts: true });
  const root = parseXml(result.content);

  it('is a dataPack 2.0 with the company IČO and the Stormware namespaces', () => {
    expect(root.qname).toBe('dat:dataPack');
    expect(root.attrs).toMatchObject({ ico: '12345679', version: '2.0', 'xmlns:inv': 'http://www.stormware.cz/schema/version_2/invoice.xsd' });
  });

  it('writes issued and received invoices, the credit note and the receipt as a voucher', () => {
    const types = descendants(root, 'invoiceType').map(n => n.text);
    expect(types).toEqual(['issuedInvoice', 'receivedInvoice', 'issuedInvoice', 'issuedCreditNotice']);
    expect(descendants(root, 'voucherType').map(n => n.text)).toEqual(['expense']);
    expect(result.count).toBe(5);
    expect(result.skipped).toEqual([]);
  });

  it('maps VAT rates through legislation and sums per rate', () => {
    const invoice = descendants(root, 'invoice')[0];
    const items = descendants(invoice, 'invoiceItem');
    expect(items.map(i => textAt(i, 'rateVAT'))).toEqual(['high', 'third']);
    expect(items.map(i => textAt(i, 'percentVAT'))).toEqual(['23', '5']);
    const home = at(invoice, 'invoiceSummary/homeCurrency');
    expect(textAt(home, 'priceHigh')).toBe('500.00');
    expect(textAt(home, 'priceHighVAT')).toBe('115.00');
    expect(textAt(home, 'price3')).toBe('36.00');
  });

  it('keeps the supplier number of a received invoice as originalDocument', () => {
    const received = descendants(root, 'invoice')[1];
    expect(textAt(received, 'invoiceHeader/originalDocument')).toBe('2026/0815');
    expect(at(received, 'invoiceHeader/number')).toBeNull();
    expect(textAt(received, 'invoiceHeader/partnerIdentity/address/company')).toBe('Dodávateľ, s. r. o.');
  });

  it('writes a foreign currency invoice with its rate', () => {
    const czk = descendants(root, 'invoice')[2];
    expect(textAt(czk, 'invoiceSummary/foreignCurrency/currency/ids')).toBe('CZK');
    expect(textAt(czk, 'invoiceSummary/foreignCurrency/rate')).toBe('25.120');
    expect(textAt(czk, 'invoiceDetail/invoiceItem/rateVAT')).toBe('none');
  });

  it('adds the address book on request', () => {
    expect(descendants(root, 'addressbook')).toHaveLength(3);
  });

  it('escapes the text of the data', () => {
    expect(result.content).toContain('Kniha &quot;Účtovníctvo&quot;');
  });
});

describe('Money S3 XML', () => {
  const result = exportMoneyS3(data, { ...period, now: '2026-10-01T09:00:00' });
  const root = parseXml(result.content);

  it('splits issued and received invoices and skips the receipt', () => {
    expect(descendants(root, 'FaktVyd').map(n => textAt(n, 'Doklad'))).toEqual(['FA2026001', 'FA2026002', 'DB2026001']);
    expect(descendants(root, 'FaktPrij').map(n => textAt(n, 'PrijatDokl'))).toEqual(['2026/0815']);
    expect(result.skipped.map(s => s.number)).toEqual(['BL-77']);
  });

  it('writes the VAT summary and marks the credit note', () => {
    const first = descendants(root, 'FaktVyd')[0];
    expect(textAt(first, 'SouhrnDPH/Zaklad22')).toBe('500.00');
    expect(textAt(first, 'SouhrnDPH/DPH22')).toBe('115.00');
    expect(textAt(first, 'SouhrnDPH/SeznamDalsiSazby/DalsiSazba/Zaklad')).toBe('36.00');
    expect(textAt(descendants(root, 'FaktVyd')[2], 'Dobropis')).toBe('1');
    expect(textAt(descendants(root, 'FaktVyd')[1], 'Valuty/Mena/Kod')).toBe('CZK');
  });
});

describe('Omega text', () => {
  const result = exportOmega(data, period);

  it('writes one windows-1250 file per direction with R00, R01, R02 and R03 records', () => {
    expect(result.files.map(f => f.name)).toEqual(['omega-faktury-vydane.txt', 'omega-faktury-prijate.txt']);
    const issued = decodeWindows1250(result.files[0].data).split('\r\n');
    expect(issued[0]).toBe('R00\tT01');
    const header = issued[1].split('\t');
    expect(header[0]).toBe('R01');
    expect(header.length).toBe(OMEGA_HEADER.length + 1);
    expect(header[1 + OMEGA_HEADER.indexOf('issueDate')]).toBe('02.09.2026');
    expect(header[1 + OMEGA_HEADER.indexOf('baseStandard')]).toBe('500,00');
    expect(issued.filter(l => l.startsWith('R03'))).toHaveLength(4);
    expect(result.replaced).toBe(0);
  });

  it('keeps Slovak letters in windows-1250', () => {
    expect(decodeWindows1250(result.files[1].data)).toContain('Dodávateľ, s. r. o.');
    expect(result.files[1].data.includes(0xbe)).toBe(true);
  });
});

describe('WE Budget CSV', () => {
  it('lists the money that moved, income positive and expenses negative', () => {
    const result = exportWeBudgetCsv(data, { ...period, describe: d => `Doklad ${d.number}` });
    const lines = result.content.replace('\ufeff', '').trim().split('\r\n');
    expect(lines[0]).toBe('Date,Amount,Description,Counterparty,Note');
    expect(lines.slice(1)).toEqual([
      '2026-09-10,651.80,Doklad FA2026001,"Odberateľ, a. s.",2026001',
      '2026-09-18,-492.00,Doklad 2026/0815,"Dodávateľ, s. r. o.",20260815',
      '2026-09-21,-15.13,Doklad BL-77,Papiernictvo,'
    ]);
  });

  it('turns the sign of a refund on a credit note', () => {
    const refund = { ...documents[1], status: 'PAID', payments: [{ id: 'r', date: '2026-09-25', amount: '61.50', currency: 'EUR', method: 'TRANSFER', source: 'MANUAL' }] };
    const result = exportWeBudgetCsv({ documents: [refund] }, period);
    expect(result.content).toContain('2026-09-25,-61.50');
  });

  it('leaves out payments in another currency', () => {
    const czk = { ...documents[2], payments: [{ id: 'c', date: '2026-09-20', amount: '25120', currency: 'CZK', method: 'TRANSFER', source: 'MANUAL' }] };
    const result = exportWeBudgetCsv({ documents: [czk] }, period);
    expect(result.count).toBe(0);
    expect(result.skipped).toEqual([{ id: czk.id, number: 'FA2026002', reason: 'CURRENCY' }]);
  });
});
