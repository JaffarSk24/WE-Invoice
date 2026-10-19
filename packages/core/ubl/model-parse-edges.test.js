// Less common paths of the UBL model, the received document reader and the
// code lists: legal texts missing for the document date, self billing,
// attachment options, unknown type codes, references without an embedded
// file and totals that cannot be recomputed from what the sender stated.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { ublModel } from './model.js';
import { parseUbl } from './parse.js';
import { kindOfTypeCode, methodOfPaymentCode, paymentMeansCode, unitCode } from './codes.js';
import { getLegislation } from '../legislation/index.js';

const fixture = (id) => readFileSync(new URL(`../../../tests/fixtures/ubl/expected/${id}.xml`, import.meta.url), 'utf8');

const buyer = { name: 'Beta a.s.', dic: '2020000026', icDph: 'SK2020000026', address: { country: 'SK' } };
const line = (fields = {}) => ({ id: 'l1', name: 'Služba', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23', ...fields });
const doc = (fields = {}) => ({
  kind: 'INVOICE', number: 'FA1', issueDate: '2027-01-15', taxDate: '2027-01-15', dueDate: '2027-01-29', currency: 'EUR', buyer, lines: [line()], ...fields
});

afterEach(() => vi.restoreAllMocks());

describe('kindOfTypeCode and payment codes', () => {
  it('maps known UNCL1001 codes to their kind and any other invoice code to INVOICE', () => {
    expect(kindOfTypeCode('380')).toBe('INVOICE');
    expect(kindOfTypeCode('381')).toBe('CREDIT_NOTE');
    expect(kindOfTypeCode('389')).toBe('SELF_BILLING');
    expect(kindOfTypeCode('386')).toBe('INVOICE');
    expect(kindOfTypeCode('751')).toBe('INVOICE');
    expect(kindOfTypeCode(null)).toBe('INVOICE');
  });

  it('chooses SEPA only for a transfer in EUR and falls back to code 1 for an unknown method', () => {
    expect(paymentMeansCode(undefined, 'EUR')).toBe('58');
    expect(paymentMeansCode('TRANSFER', 'CZK')).toBe('30');
    expect(paymentMeansCode('COD', 'EUR')).toBe('10');
    expect(paymentMeansCode('BARTER', 'EUR')).toBe('1');
    expect(methodOfPaymentCode('49')).toBe('TRANSFER');
    expect(methodOfPaymentCode('ZZZ')).toBe('TRANSFER');
  });

  it('keeps a valid Recommendation 20 unit code and replaces anything else by C62', () => {
    expect(unitCode({ unit: { code: 'HUR' } })).toBe('HUR');
    expect(unitCode({ unit: { code: 'hour' } })).toBe('C62');
    expect(unitCode({})).toBe('C62');
  });
});

describe('ublModel: legal texts and exemption reasons', () => {
  it('writes the self billing text for a SELF_BILLING document (type 389)', () => {
    const model = ublModel(doc({ kind: 'SELF_BILLING' }));
    expect(model.typeCode).toBe('389');
    expect(model.root).toBe('Invoice');
    expect(model.note).toBe(getLegislation('texts.selfBilling.sk', '2027-01-15'));
  });

  it('leaves out legal texts that are not in force on the tax date and warns once per text', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const model = ublModel(doc({ issueDate: '2024-06-01', taxDate: '2024-06-01', lines: [line({ vatCategory: 'AE', vatRate: null })] }), { cashBasis: true }, { note: 'Ďakujeme' });
    expect(model.note).toBe('Ďakujeme');
    expect(warn).toHaveBeenCalledWith('ubl: legal text not available', 'reverseCharge', 'LEGISLATION_NOT_IN_FORCE');
    expect(warn).toHaveBeenCalledWith('ubl: legal text not available', 'cashBasis', 'LEGISLATION_NOT_IN_FORCE');
  });

  it('marks a reason as defaulted but leaves it empty when legislation has none for the date', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const model = ublModel(doc({ issueDate: '2024-06-01', taxDate: '2024-06-01', lines: [line({ vatCategory: 'E', vatRate: null })] }));
    expect(model.defaultedReasons).toEqual(['E']);
    expect(model.totals.breakdown[0]).toMatchObject({ category: 'E', exemptionReasonCode: null, exemptionReasonText: null });
    expect(warn).toHaveBeenCalledWith('ubl: no default exemption reason', 'E', 'LEGISLATION_NOT_IN_FORCE');
  });

  it('fills the general reason of the category when the date is covered', () => {
    const [first] = getLegislation('exemptionReasons.byCategory.E', '2027-01-15');
    const model = ublModel(doc({ lines: [line({ vatCategory: 'E', vatRate: null })] }));
    expect(model.totals.breakdown[0]).toMatchObject({ exemptionReasonCode: first.code, exemptionReasonText: first.law });
  });

  it('adds no legal text with noLegalNotes, only the given note', () => {
    const model = ublModel(doc({ kind: 'SELF_BILLING' }), { cashBasis: true }, { note: 'Pôvodná poznámka', noLegalNotes: true });
    expect(model.note).toBe('Pôvodná poznámka');
  });
});

describe('ublModel: documented options', () => {
  const pdf = { base64: 'A'.repeat(400), name: 'FA1.pdf' };

  it('attaches the PDF by default and leaves it out when attachPdf is false or the company default is off', () => {
    expect(ublModel(doc(), {}, { pdf }).pdf).toBe(pdf);
    expect(ublModel(doc(), {}, { pdf, attachPdf: false }).pdf).toBeNull();
    expect(ublModel(doc(), { defaults: { attachPdfToEInvoice: false } }, { pdf }).pdf).toBeNull();
    expect(ublModel(doc(), { defaults: { attachPdfToEInvoice: false } }, { pdf, attachPdf: true }).pdf).toBe(pdf);
  });

  it('drops a PDF larger than maxAttachmentBytes and reports it only when an attachment was wanted', () => {
    expect(ublModel(doc(), {}, { pdf, maxAttachmentBytes: 299 })).toMatchObject({ pdf: null, pdfTooLarge: true });
    expect(ublModel(doc(), {}, { pdf, maxAttachmentBytes: 300 })).toMatchObject({ pdf, pdfTooLarge: false });
    expect(ublModel(doc(), {}, { pdf, maxAttachmentBytes: 1, attachPdf: false })).toMatchObject({ pdf: null, pdfTooLarge: false });
  });

  it('keeps only preceding invoices that have a number', () => {
    const model = ublModel(doc({ kind: 'CREDIT_NOTE' }), {}, { preceding: [null, { number: '' }, { number: 'FA0', issueDate: '2027-01-01' }] });
    expect(model.preceding).toEqual([{ number: 'FA0', issueDate: '2027-01-01' }]);
  });

  it('passes prepaid to the totals', () => {
    expect(ublModel(doc(), {}, { prepaid: '23.00' }).totals.payable).toBe('100.00');
  });

  it('picks the bank account of the document, then the default one in its currency', () => {
    const accounts = [
      { id: 'a', iban: 'SK1', currency: 'EUR', isDefault: true },
      { id: 'b', iban: 'CZ2', currency: 'CZK', isDefault: true },
      { id: 'c', iban: 'SK3', currency: 'EUR' }
    ];
    expect(ublModel(doc({ bankAccountId: 'c' }), { bankAccounts: accounts }).bankAccount.id).toBe('c');
    expect(ublModel(doc({ currency: 'CZK', fxRate: '25' }), { bankAccounts: accounts }).bankAccount.id).toBe('b');
    expect(ublModel(doc({ paymentAccount: { iban: 'SK9' } }), { bankAccounts: accounts }).bankAccount).toEqual({ iban: 'SK9' });
    expect(ublModel(doc()).bankAccount).toBeNull();
  });
});

describe('parseUbl: unusual received documents', () => {
  it('reports a line whose stated amount differs from quantity times price', () => {
    const xml = fixture('01-basic-23').replace('<cbc:PriceAmount currencyID="EUR">45</cbc:PriceAmount>', '<cbc:PriceAmount currencyID="EUR">44.99</cbc:PriceAmount>');
    const { document, warnings } = parseUbl(xml);
    expect(document.lines[0].unitPrice).toBe('44.99');
    expect(warnings).toContainEqual({ code: 'LINE_AMOUNT_MISMATCH', line: '1', stated: '450.00', computed: '449.90' });
  });

  it('skips a document reference that has no embedded file', () => {
    const xml = fixture('24-pdf-attachment').replace('<cac:AdditionalDocumentReference>',
      '<cac:AdditionalDocumentReference>\n    <cbc:ID>OBJ-1</cbc:ID>\n    <cbc:DocumentDescription>Objednávka</cbc:DocumentDescription>\n  </cac:AdditionalDocumentReference>\n  <cac:AdditionalDocumentReference>');
    const { attachments } = parseUbl(xml);
    expect(attachments.map(a => a.id)).toEqual(['FA2027024']);
  });

  it('names an attachment without filename after its reference and strips line breaks from the base64', () => {
    const xml = fixture('24-pdf-attachment').replace(
      '<cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="FA2027024.pdf">JVBERi0xLjQKJSBXRSBJbnZvaWNlIGZpeHR1cmUKJSVFT0YK</cbc:EmbeddedDocumentBinaryObject>',
      '<cbc:EmbeddedDocumentBinaryObject>JVBERi0xLjQK\n      JSBXRSBJbnZvaWNlIGZpeHR1cmUKJSVFT0YK</cbc:EmbeddedDocumentBinaryObject>');
    const { attachments } = parseUbl(xml);
    expect(attachments).toEqual([{ id: 'FA2027024', name: 'FA2027024', mime: 'application/octet-stream', description: null, base64: 'JVBERi0xLjQKJSBXRSBJbnZvaWNlIGZpeHR1cmUKJSVFT0YK' }]);
  });

  it('keeps the stated totals and warns when the lines cannot be recomputed (base quantity 0)', () => {
    const xml = fixture('01-basic-23').replace('<cbc:PriceAmount currencyID="EUR">45</cbc:PriceAmount>',
      '<cbc:PriceAmount currencyID="EUR">45</cbc:PriceAmount>\n      <cbc:BaseQuantity>0</cbc:BaseQuantity>');
    const { document, warnings } = parseUbl(xml);
    expect(document.lines[0].baseQty).toBe('0');
    expect(document.totals.payable).toBe('553.50');
    expect(warnings).toEqual([{ code: 'TOTALS_NOT_COMPUTABLE', detail: 'DIVISION_BY_ZERO' }]);
  });

  it('warns instead of failing on a VAT category the core does not know', () => {
    const xml = fixture('01-basic-23').replaceAll('<cbc:ID>S</cbc:ID>', '<cbc:ID>X</cbc:ID>');
    const { document, warnings } = parseUbl(xml);
    expect(document.lines[0].vatCategory).toBe('X');
    expect(warnings).toEqual([{ code: 'TOTALS_NOT_COMPUTABLE', detail: 'VAT_CATEGORY_INVALID' }]);
  });

  it('reads an unknown invoice type code as an invoice and keeps the code', () => {
    const xml = fixture('01-basic-23').replace('<cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>', '<cbc:InvoiceTypeCode>751</cbc:InvoiceTypeCode>');
    const { document } = parseUbl(xml, { received: true });
    expect(document).toMatchObject({ kind: 'RECEIVED_INVOICE', ublTypeCode: '751' });
  });

  it('gives an empty buyer when the customer party is missing', () => {
    const xml = fixture('01-basic-23').replace(/<cac:AccountingCustomerParty>[\s\S]*<\/cac:AccountingCustomerParty>/, '');
    const { document } = parseUbl(xml);
    expect(document.buyer).toEqual({ name: '', address: {} });
    expect(document.seller.dic).toBe('2020000004');
  });

  it('names the required amount that is missing', () => {
    const xml = fixture('01-basic-23').replace('<cbc:PayableAmount currencyID="EUR">553.50</cbc:PayableAmount>', '');
    expect(() => parseUbl(xml)).toThrow(expect.objectContaining({ code: 'UBL_REQUIRED_MISSING', details: { field: 'PayableAmount' } }));
  });

  it('refuses a document without lines', () => {
    const xml = fixture('01-basic-23').replace(/<cac:InvoiceLine>[\s\S]*<\/cac:InvoiceLine>/, '');
    expect(() => parseUbl(xml)).toThrow(expect.objectContaining({ code: 'UBL_REQUIRED_MISSING', details: { field: 'InvoiceLine' } }));
  });

  it('reads a document whose values come from CDATA, entities and comments', () => {
    const xml = fixture('01-basic-23')
      .replace('<cbc:ID>FA2027001</cbc:ID>', '<cbc:ID><![CDATA[FA2027001]]></cbc:ID>')
      .replace('<cbc:Name>Vývoj softvéru</cbc:Name>', '<cbc:Name>V&#253;voj &amp; <!-- note -->testovanie</cbc:Name>');
    const { document, warnings } = parseUbl(xml);
    expect(warnings).toEqual([]);
    expect(document.number).toBe('FA2027001');
    expect(document.lines[0].name).toBe('Vývoj & testovanie');
  });
});
