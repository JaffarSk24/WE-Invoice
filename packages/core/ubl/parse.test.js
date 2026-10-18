import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseUbl } from './index.js';

const fixture = (id) => readFileSync(new URL(`../../../tests/fixtures/ubl/expected/${id}.xml`, import.meta.url), 'utf8');

describe('parseUbl', () => {
  it('reads a received invoice with parties, lines, payment and references', () => {
    const { document, attachments, warnings } = parseUbl(fixture('26-references-and-period'), { received: true });
    expect(warnings).toEqual([]);
    expect(attachments).toEqual([]);
    expect(document).toMatchObject({
      kind: 'RECEIVED_INVOICE', ublTypeCode: '380', number: 'FA2027026', issueDate: '2027-01-05', dueDate: '2027-01-19',
      taxDate: '2026-12-31', periodFrom: '2026-12-01', periodTo: '2026-12-31', buyerReference: 'OBJ-77', orderReference: 'PO-2027-15',
      contractReference: 'ZML-2026/4', paymentMethod: 'TRANSFER',
      paymentAccount: { iban: 'SK3112000000198742637541', bic: 'SUBASKBX', name: 'Hlavný účet' },
      seller: { name: 'Alfa Softvér s.r.o.', ico: '35000007', dic: '2020000004', icDph: 'SK2020000004', peppolId: '0245:2020000004', vatPayer: true },
      buyer: { name: 'Gama Obchod a.s.', dic: '2020000026', address: { city: 'Košice', country: 'SK' } }
    });
    expect(document.lines).toHaveLength(1);
    expect(document.lines[0]).toMatchObject({ name: 'Mesačná podpora', description: 'Podpora a údržba za december 2026', qty: '1', unitPrice: '300', vatCategory: 'S', vatRate: '23' });
    expect(document.totals).toMatchObject({ net: '300.00', vat: '69.00', gross: '369.00', payable: '369.00' });
  });

  it('reads a credit note with its preceding invoice and a received kind', () => {
    const { document } = parseUbl(fixture('17-credit-note'), { received: true });
    expect(document.kind).toBe('RECEIVED_CREDIT_NOTE');
    expect(document.preceding).toEqual([{ number: 'FA2027001', issueDate: '2027-01-15' }]);
    expect(document.dueDate).toBe('2027-02-03');
    expect(document.textIntro).toBe('Vrátenie časti tovaru');
  });

  it('returns the embedded PDF as an attachment', () => {
    const { attachments } = parseUbl(fixture('24-pdf-attachment'));
    expect(attachments).toEqual([{ id: 'FA2027024', name: 'FA2027024.pdf', mime: 'application/pdf', description: null, base64: 'JVBERi0xLjQKJSBXRSBJbnZvaWNlIGZpeHR1cmUKJSVFT0YK' }]);
  });

  it('keeps the stated totals and reports a difference instead of fixing it', () => {
    const xml = fixture('01-basic-23').replace('<cbc:TaxAmount currencyID="EUR">103.50</cbc:TaxAmount>\n    <cac:TaxSubtotal>', '<cbc:TaxAmount currencyID="EUR">103.51</cbc:TaxAmount>\n    <cac:TaxSubtotal>');
    const { document, warnings } = parseUbl(xml);
    expect(document.totals.vat).toBe('103.51');
    expect(warnings).toEqual([{ code: 'TOTALS_MISMATCH', field: 'vat', stated: '103.51', computed: '103.50' }]);
  });

  it('reads the VAT in EUR of a foreign currency document', () => {
    const { document } = parseUbl(fixture('14-currency-czk-standard'));
    expect(document.currency).toBe('CZK');
    expect(document.totals.vatEur).toMatch(/^\d+\.\d{2}$/);
  });

  it.each([
    ['<Order/>', 'UBL_ROOT_UNKNOWN'],
    ['<Invoice><cbc:ID xmlns:cbc="x">1</cbc:ID></Invoice>', 'UBL_REQUIRED_MISSING'],
    ['not xml', 'UBL_XML_INVALID']
  ])('explains what is wrong: %s', (xml, code) => {
    expect(() => parseUbl(xml)).toThrow(expect.objectContaining({ code }));
  });

  it('rejects an amount that is not a decimal', () => {
    const xml = fixture('01-basic-23').replace('<cbc:PayableAmount currencyID="EUR">553.50</cbc:PayableAmount>', '<cbc:PayableAmount currencyID="EUR">1e3</cbc:PayableAmount>');
    expect(() => parseUbl(xml)).toThrow(expect.objectContaining({ code: 'UBL_AMOUNT_INVALID' }));
  });
});
