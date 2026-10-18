// Unit tests of the Inbox building blocks: the XML reader, QR and eKasa
// recognition, merging, "Vybrať" values, supplier templates and contacts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseXml, textAt, at } from './xml.js';
import {
  parseEkasaQr, detectQrFormat, recognizeQr, recognizeEkasaReceipt, recognizeXml, detectXmlFormat, registerInboxParser,
  recognizeFound, detectInboxFile, mergeRecognitions, pickFieldValue, applyUserValue, learnTemplate, applyTemplateRegions,
  findSupplierContact, extractInvoiceFields
} from './index.js';

const dir = new URL('../../../../tests/fixtures/inbox/', import.meta.url);
const read = (path) => readFileSync(new URL(path, dir), 'utf8');
const payloads = JSON.parse(read('qr/payloads.json'));

describe('XML reader', () => {
  it('reads elements, attributes, entities, CDATA and strips prefixes', () => {
    const root = parseXml('<?xml version="1.0"?><!-- c --><a:Root xmlns:a="x"><a:B id="1">x &amp; y</a:B><C><![CDATA[<raw>]]></C><D/></a:Root>');
    expect(root.name).toBe('Root');
    expect(textAt(root, 'B')).toBe('x & y');
    expect(at(root, 'B').attrs.id).toBe('1');
    expect(textAt(root, 'C')).toBe('<raw>');
    expect(textAt(root, 'D')).toBeNull();
  });

  it('refuses broken XML with a stable code', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(expect.objectContaining({ code: 'XML_INVALID' }));
    expect(() => parseXml('<a>')).toThrow(expect.objectContaining({ code: 'XML_INVALID' }));
  });

  it('detects the e-invoice formats', () => {
    expect(detectXmlFormat(read('xml/ubl-invoice-sk.xml'))).toBe('UBL');
    expect(detectXmlFormat(read('xml/isdoc-invoice.xml'))).toBe('ISDOC');
    expect(detectXmlFormat(read('xml/cii-zugferd.xml'))).toBe('CII');
    expect(detectXmlFormat('<html></html>')).toBeNull();
    expect(detectXmlFormat('plain text')).toBeNull();
    expect(() => recognizeXml('<html/>')).toThrow(expect.objectContaining({ code: 'INBOX_FORMAT_UNKNOWN' }));
  });

  it('keeps UBL lines and embedded attachments', () => {
    const r = recognizeXml(read('xml/ubl-invoice-sk.xml'));
    expect(r.fields.lines).toHaveLength(2);
    expect(r.fields.lines[0]).toMatchObject({ name: 'Vizitky, obojstranná tlač', qty: '500', unitPrice: '0.3', vatRate: '23', unitCode: 'H87' });
    expect(r.fields.lines[1].name).toBe('Grafický návrh & príprava');
    expect(r.attachments[0]).toMatchObject({ name: 'FA2026-0142.pdf', mime: 'application/pdf' });
    expect(r.fields.breakdown).toEqual([{ category: 'S', rate: '23', base: '250.00', vat: '57.50' }]);
  });

  it('prefers a registered parser and still takes the IBAN from the minimal reader', () => {
    const remove = registerInboxParser('UBL', () => ({
      document: { kind: 'INVOICE', number: 'EXT-1', currency: 'EUR', seller: { name: 'External', ico: '45551235' }, totals: { net: '1.00', vat: '0.23', payable: '1.23', breakdown: [] }, lines: [] },
      warnings: ['W1']
    }));
    try {
      const r = recognizeXml(read('xml/ubl-invoice-sk.xml'));
      expect(r.fields.number).toBe('EXT-1');
      expect(r.fields.supplierName).toBe('External');
      expect(r.fields.iban).toBe('SK6609000000005012345678');
      expect(r.warnings).toContain('W1');
    } finally {
      remove();
    }
    expect(recognizeXml(read('xml/ubl-invoice-sk.xml')).fields.number).toBe('FA2026-0142');
  });
});

describe('QR codes and eKasa', () => {
  it('parses online and offline eKasa codes', () => {
    expect(parseEkasaQr(payloads['ekasa-online'])).toEqual({ kind: 'ONLINE', receiptId: 'O-7DBCDA8A56EE426DBCDA8A56EE426D1A' });
    expect(parseEkasaQr(`https://example.org/receipt/${payloads['ekasa-online'].toLowerCase()}`).receiptId).toBe(payloads['ekasa-online']);
    expect(parseEkasaQr(payloads['ekasa-offline'])).toMatchObject({ kind: 'OFFLINE', cashRegisterCode: '88812345678900001', issueDate: '2026-10-14', issueTime: '17:42:05', amount: '79.83' });
    expect(parseEkasaQr('hello')).toBeNull();
  });

  it('detects formats and ignores unknown QR texts', () => {
    expect(detectQrFormat(payloads['pbs-painter'])).toBe('PAY_BY_SQUARE');
    expect(detectQrFormat(payloads['spd-hosting'])).toBe('QR_PLATBA');
    expect(detectQrFormat('https://example.org')).toBeNull();
    expect(recognizeQr('https://example.org')).toBeNull();
    expect(recognizeQr('ABCDEFGHIJKLMNOPQRSTUV')).toBeNull();
  });

  it('asks the gateway for an online receipt', () => {
    expect(recognizeQr(payloads['ekasa-online']).receipt).toEqual({ kind: 'ONLINE', receiptId: payloads['ekasa-online'] });
  });

  it('turns a gateway receipt into an expense receipt with VAT per rate', () => {
    const r = recognizeEkasaReceipt(JSON.parse(read('qr/ekasa-receipt.json')));
    expect(r.fields).toMatchObject({ kind: 'EXPENSE_RECEIPT', ico: '36987123', dic: '2055667702', icDph: 'SK2055667702', issueDate: '2026-10-14', total: '81.93', currency: 'EUR' });
    expect(r.fields.breakdown).toEqual([
      { category: 'S', rate: '23', base: '64.90', vat: '14.93' },
      { category: 'S', rate: '5', base: '2.00', vat: '0.10' }
    ]);
    expect(r.fields.net).toBe('66.90');
    expect(r.fields.vat).toBe('15.03');
    expect(r.fields.lines[0]).toMatchObject({ name: 'Natural 95', qty: '42.15', priceType: 'GROSS', vatRate: '23' });
    expect(r.fields.paymentMethod).toBeUndefined();
  });
});

describe('combining what a file holds', () => {
  const company = { ico: '36123455', dic: '2020123402', icDph: 'SK2020123402', bankAccounts: [{ iban: 'SK2411000000002612345678' }] };

  it('takes XML over text and needs no confirmation', () => {
    const r = recognizeFound({ xml: [read('xml/ubl-invoice-sk.xml')], text: read('text/sk-invoice-simple.txt') }, { company, today: '2026-10-18' });
    expect(r.format).toBe('UBL');
    expect(r.fields.number).toBe('FA2026-0142');
    expect(r.needsConfirmation).toBe(false);
  });

  it('lets a QR payment beat the text but keeps the confirmation', () => {
    const r = recognizeFound({ qr: [payloads['pbs-accounting']], text: read('text/sk-invoice-simple.txt') }, { company, today: '2026-10-18' });
    expect(r.sources.iban).toBe('qr');
    expect(r.sources.ico).toBe('text');
    expect(r.fields.total).toBe('221.40');
    expect(r.needsConfirmation).toBe(true);
  });

  it('uses OCR text only when there is no text layer', () => {
    const r = recognizeFound({ text: '', ocrText: read('text/sk-invoice-simple.txt') }, { company, today: '2026-10-18' });
    expect(r.format).toBe('OCR');
    expect(r.sources.ico).toBe('ocr');
    expect(r.fieldConfidence.ico).toBeLessThan(0.95);
  });

  it('returns an empty recognition for an empty file', () => {
    expect(recognizeFound({}, {}).format).toBe('NONE');
    expect(mergeRecognitions().fields).toEqual({});
  });

  it('skips the own company and its IBAN even when printed as the supplier', () => {
    const r = extractInvoiceFields(read('text/sk-invoice-noisy.txt'), { company, today: '2026-10-18' });
    expect(r.fields.ico).toBe('47773332');
    const plain = extractInvoiceFields('Dodávateľ: X\nIBAN: SK2411000000002612345678\nIBAN: SK6609000000005012345678', { company });
    expect(plain.fields.iban).toBe('SK6609000000005012345678');
  });

  it('detects the kind of an Inbox file', () => {
    expect(detectInboxFile({ head: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) })).toBe('PDF');
    expect(detectInboxFile({ name: 'scan.JPG' })).toBe('IMAGE');
    expect(detectInboxFile({ head: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) })).toBe('IMAGE');
    expect(detectInboxFile({ name: 'faktura.isdoc' })).toBe('XML');
    expect(detectInboxFile({ mime: 'text/xml' })).toBe('XML');
    expect(detectInboxFile({ name: 'notes.docx' })).toBeNull();
  });
});

describe('"Vybrať" and supplier templates', () => {
  it.each([
    ['ico', 'IČO: 45 551 235', '45551235'],
    ['ico', 'IČO: 45551236', null],
    ['icDph', 'IČ DPH SK 2030556605', 'SK2030556605'],
    ['dic', '2030556605', '2030556605'],
    ['iban', 'SK66 0900 0000 0050 1234 5678', 'SK6609000000005012345678'],
    ['iban', 'SK66 0900 0000 0050 1234 5679', null],
    ['total', 'Spolu 1 234,50 €', '1234.50'],
    ['vat', '-23,00', '-23.00'],
    ['issueDate', 'Dátum: 5. 10. 2026', '2026-10-05'],
    ['dueDate', '31.02.2026', null],
    ['vs', 'VS 20260142', '20260142'],
    ['ks', 'KS: 0308', '0308'],
    ['number', 'Faktúra č. FA-77/2026', 'FA-77/2026'],
    ['currency', '1 815,00 CZK', 'CZK'],
    ['currency', '12 €', 'EUR'],
    ['bic', 'SWIFT: GIBASKBX', 'GIBASKBX'],
    ['supplierName', '  Tlačiareň Orava s.r.o. ', 'Tlačiareň Orava s.r.o.'],
    ['total', '', null]
  ])('%s from "%s"', (field, raw, expected) => {
    expect(pickFieldValue(field, raw)).toBe(expected);
  });

  it('applies a picked value as trusted', () => {
    const r = extractInvoiceFields('Faktúra 1\nSpolu: 10,00 €', {});
    const next = applyUserValue(r, 'total', '12.00');
    expect(next.fields.total).toBe('12.00');
    expect(next.sources.total).toBe('user');
    expect(r.fields.total).toBe('10.00');
  });

  it('learns a template and fills fields from its regions', () => {
    const t1 = learnTemplate(null, { category: 'SERVICES', regions: { number: { page: 1, x: 0.6, y: 0.1, w: 0.3, h: 0.03 } } });
    const t2 = learnTemplate(t1, { paymentMethod: 'TRANSFER' });
    expect(t2).toMatchObject({ category: 'SERVICES', paymentMethod: 'TRANSFER', uses: 2 });
    expect(t2.regions.number.x).toBe(0.6);
    const r = applyTemplateRegions(extractInvoiceFields('Spolu: 10,00 €', {}), t2, () => 'č. 2026-55');
    expect(r.fields.number).toBe('2026-55');
    expect(r.sources.number).toBe('template');
  });

  it('finds the supplier contact by IČO, IČ DPH, IBAN or name', () => {
    const contacts = [
      { id: 'a', name: 'Alfa', ico: '45551235' },
      { id: 'b', name: 'Beta', icDph: 'SK2030556605' },
      { id: 'c', name: 'Gama', iban: 'SK66 0900 0000 0050 1234 5678' },
      { id: 'd', name: 'Delta s.r.o.' },
      { id: 'e', name: 'Old', ico: '46120092', deleted: true }
    ];
    expect(findSupplierContact(contacts, { ico: '45551235' }).id).toBe('a');
    expect(findSupplierContact(contacts, { icDph: 'SK2030556605' }).id).toBe('b');
    expect(findSupplierContact(contacts, { iban: 'SK6609000000005012345678' }).id).toBe('c');
    expect(findSupplierContact(contacts, { supplierName: ' delta s.r.o.' }).id).toBe('d');
    expect(findSupplierContact(contacts, { ico: '46120092' })).toBeNull();
    expect(findSupplierContact(null, {})).toBeNull();
  });
});
