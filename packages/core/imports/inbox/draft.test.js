// The draft received document, expense categories and input VAT.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  recognizeXml, extractInvoiceFields, recognizeEkasaReceipt, draftFromRecognition, draftLines, receivedTotals,
  PURCHASE_CATEGORIES, EXPENSE_CATEGORIES, expenseCategory, expenseCategoryOf, withExpenseCategory,
  vatPeriodKey, vatDeductionPeriodOf, deductibleVat, receivedKvSections
} from '../../index.js';
import { schema } from '../../index.js';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validDocument = ajv.compile(schema.SCHEMAS.Document);

const dir = new URL('../../../../tests/fixtures/inbox/', import.meta.url);
const read = (path) => readFileSync(new URL(path, dir), 'utf8');
const company = {
  name: 'Biela Orlica s.r.o.', ico: '36123455', dic: '2020123402', icDph: 'SK2020123402', vatMode: 'PAYER', vatPeriod: 'MONTH',
  address: { street: 'Hlavná 1', city: 'Bratislava', zip: '81101', country: 'SK' }, bankAccounts: []
};
const ctx = { company, today: '2026-10-18', lineName: 'Nákup' };

describe('draft received document', () => {
  it('builds a valid TO_PROCESS invoice from UBL with the supplier lines', () => {
    const doc = draftFromRecognition(recognizeXml(read('xml/ubl-invoice-sk.xml')), { ...ctx, file: { id: 'f1', name: 'a.xml', mime: 'text/xml', size: 10 } });
    expect(doc).toMatchObject({ kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS', number: 'FA2026-0142', vs: '20260142', receivedDate: '2026-10-18', currency: 'EUR', paymentMethod: 'TRANSFER' });
    expect(doc.seller).toMatchObject({ name: 'Tlačiareň Orava s.r.o.', ico: '45551235', icDph: 'SK2030556605', vatPayer: true });
    expect(doc.buyer.ico).toBe('36123455');
    expect(doc.lines).toHaveLength(2);
    expect(doc.totals).toMatchObject({ net: '250.00', vat: '57.50', gross: '307.50', payable: '307.50' });
    expect(doc.payee).toEqual({ iban: 'SK6609000000005012345678', bic: 'GIBASKBX' });
    expect(doc.attachments[0].id).toBe('f1');
    expect(doc.inbox).toMatchObject({ format: 'UBL', needsConfirmation: false });
    expect(doc.vatDeductionPeriod).toBe('2026-10');
    expect(validDocument({ ...doc, id: 'x', createdAt: '2026-10-18T10:00:00Z', updatedAt: '2026-10-18T10:00:00Z' }), JSON.stringify(validDocument.errors)).toBe(true);
  });

  it('makes one line per VAT rate from a text and keeps the printed VAT', () => {
    const doc = draftFromRecognition(extractInvoiceFields(read('text/sk-invoice-multirate.txt'), ctx), ctx);
    expect(doc.lines.map(l => [l.unitPrice, l.vatRate, l.name])).toEqual([['1250.00', '23', 'Nákup'], ['400.00', '19', 'Nákup'], ['80.00', '5', 'Nákup']]);
    expect(doc.totals.vat).toBe('367.50');
    expect(doc.inbox.needsConfirmation).toBe(true);
  });

  it('uses one outside-scope line for a non-payer and the template choices', () => {
    const r = extractInvoiceFields(read('text/sk-invoice-nonpayer.txt'), ctx);
    const doc = draftFromRecognition(r, { ...ctx, template: { category: 'SERVICES', paymentMethod: 'CASH', lineName: 'Maľovanie' } });
    expect(doc.lines).toEqual([expect.objectContaining({ unitPrice: '540.00', vatCategory: 'O', vatRate: null, name: 'Maľovanie', accountingCategory: 'EXPENSE_TAX_SERVICES' })]);
    expect(doc.expenseCategory).toBe('SERVICES');
    expect(doc.paymentMethod).toBe('CASH');
    expect(doc.seller.vatPayer).toBe(false);
    expect(doc.totals.payable).toBe('540.00');
  });

  it('leaves the payment method of a receipt to the user', () => {
    const doc = draftFromRecognition(recognizeEkasaReceipt(JSON.parse(read('qr/ekasa-receipt.json'))), ctx);
    expect(doc.kind).toBe('EXPENSE_RECEIPT');
    expect(doc.paymentMethod).toBeUndefined();
    expect(doc.inbox.receiptId).toBe('O-7DBCDA8A56EE426DBCDA8A56EE426D1A');
    expect(doc.totals.payable).toBe('81.93');
    expect(doc.lines[0].priceType).toBe('GROSS');
  });

  it('keeps the printed totals when a line is unfinished', () => {
    const fields = { total: '12.00', lines: [{ name: 'x', qty: '1', unitPrice: '10', vatCategory: 'S', vatRate: null }] };
    const doc = { lines: draftLines(fields), currency: 'EUR' };
    expect(receivedTotals(doc, fields)).toMatchObject({ payable: '12.00', gross: '12.00' });
  });

  it('drops symbols that are not digits', () => {
    const doc = draftFromRecognition({ format: 'TEXT', fields: { vs: 'ABC', ks: '12345', total: '1.00' }, sources: {}, fieldConfidence: {}, confidence: 0, needsConfirmation: true }, { today: '2026-10-18' });
    expect(doc.vs).toBeNull();
    expect(doc.ks).toBeNull();
    expect(doc.vatDeductionPeriod).toBeNull();
  });
});

describe('expense categories', () => {
  it('map onto the peňažný denník categories of the ledger and have unique ids', () => {
    const ids = PURCHASE_CATEGORIES.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    PURCHASE_CATEGORIES.forEach(c => {
      expect(EXPENSE_CATEGORIES).toContain(c.ledgerCategory);
      expect(['YES', 'NO', 'PARTIAL']).toContain(c.taxDeductible);
      expect(c.taxDeductible === 'NO').toBe(c.ledgerCategory === 'EXPENSE_NONTAX');
    });
    expect(expenseCategory('REPRESENTATION')).toMatchObject({ taxDeductible: 'NO', vatDeductible: false });
    expect(expenseCategory('NOPE')).toBeNull();
  });

  it('are set on and read from the item lines', () => {
    const doc = withExpenseCategory({ lines: [{ kind: 'ITEM' }, { kind: 'TEXT' }, { kind: 'ITEM' }] }, 'FUEL');
    expect(expenseCategoryOf(doc)).toBe('FUEL');
    expect(doc.lines.map(l => l.accountingCategory)).toEqual(['EXPENSE_TAX_OVERHEAD', undefined, 'EXPENSE_TAX_OVERHEAD']);
    expect(withExpenseCategory(doc, null)).toMatchObject({ expenseCategory: null, lines: [{ accountingCategory: null }, { kind: 'TEXT' }, { accountingCategory: null }] });
    // A document categorised in the ledger only gets the first matching purchase category.
    expect(expenseCategoryOf({ lines: [{ accountingCategory: 'EXPENSE_TAX_WAGES' }] })).toBe('WAGES');
    expect(expenseCategoryOf({ lines: [{ accountingCategory: 'EXPENSE_TAX_GOODS' }, { accountingCategory: 'EXPENSE_TAX_WAGES' }] })).toBeNull();
  });
});

describe('input VAT', () => {
  it('names the period by the company VAT period', () => {
    expect(vatPeriodKey('2026-11-30', 'QUARTER')).toBe('2026-Q4');
    expect(vatPeriodKey('2026-02-01')).toBe('2026-02');
    expect(vatPeriodKey(null)).toBeNull();
  });

  it('claims the deduction in the later of supply and receipt', () => {
    expect(vatDeductionPeriodOf({ taxDate: '2026-09-30', receivedDate: '2026-10-02' }, company)).toBe('2026-10');
    expect(vatDeductionPeriodOf({ taxDate: '2026-10-05', receivedDate: '2026-10-02' }, { ...company, vatPeriod: 'QUARTER' })).toBe('2026-Q4');
    expect(vatDeductionPeriodOf({ taxDate: '2026-10-05' }, { ...company, vatMode: 'NONPAYER' })).toBeNull();
  });

  it('deducts standard-rated VAT except for excluded categories', () => {
    const doc = { totals: { vat: '30.00', breakdown: [{ category: 'S', vat: '23.00' }, { category: 'S', vat: '5.00' }, { category: 'E', vat: '0.00' }] } };
    expect(deductibleVat(doc)).toBe('28.00');
    expect(deductibleVat(doc, 'REPRESENTATION')).toBe('0.00');
    expect(deductibleVat({ totals: { vat: '4.6', breakdown: [] } })).toBe('4.60');
  });

  it('places received documents in the kontrolný výkaz', () => {
    expect(receivedKvSections({ kind: 'RECEIVED_INVOICE', seller: { icDph: 'SK2030556605' } })).toEqual(['B2']);
    expect(receivedKvSections({ kind: 'EXPENSE_RECEIPT' })).toEqual(['B3']);
    expect(receivedKvSections({ kind: 'RECEIVED_CREDIT_NOTE' })).toEqual(['C2']);
    expect(receivedKvSections({ kind: 'RECEIVED_INVOICE', totals: { breakdown: [{ category: 'AE' }] } })).toEqual(['A2', 'B1']);
    expect(receivedKvSections({ kind: 'RECEIVED_INVOICE', seller: { icDph: 'DE123456789' } })).toEqual([]);
  });
});
