import { describe, it, expect } from 'vitest';
import { entriesForPayment, paymentDirection, paymentMedium, allocate, entryId } from './payment-entries.js';
import { planEntrySync } from './sync-plan.js';
import { categoryDirection, lineCategory, isTaxCategory, categoryFits } from './categories.js';

const line = (over = {}) => ({ id: 'l1', name: 'a', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23', ...over });
const doc = (over = {}) => ({
  id: 'd1', kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', number: '2026001', buyer: { name: 'Odberateľ' }, seller: { name: 'Dodávateľ' },
  lines: [line()], payments: [], ...over
});
const pay = (over = {}) => ({ id: 'p1', date: '2026-03-10', amount: '123', method: 'TRANSFER', source: 'BANK_IMPORT', ...over });
const PAYER = { vatMode: 'PAYER' };
const NONPAYER = { vatMode: 'NONPAYER' };

describe('categories', () => {
  it('knows the direction of every category', () => {
    expect(categoryDirection('INCOME_TAX_GOODS')).toBe('INCOME');
    expect(categoryDirection('EXPENSE_NONTAX')).toBe('EXPENSE');
    expect(categoryDirection('TRANSFER')).toBe('TRANSFER');
    expect(() => categoryDirection('NOPE')).toThrow(expect.objectContaining({ code: 'LEDGER_CATEGORY_INVALID' }));
    expect(categoryFits('NOPE', 'INCOME')).toBe(false);
  });

  it('tells tax from non-tax columns', () => {
    expect(isTaxCategory('INCOME_TAX_OTHER')).toBe(true);
    expect(isTaxCategory('INCOME_NONTAX')).toBe(false);
    expect(isTaxCategory('EXPENSE_UNCATEGORIZED')).toBe(false);
  });

  it('uses the line category only when it fits the direction', () => {
    expect(lineCategory({ accountingCategory: 'INCOME_TAX_GOODS' }, 'INCOME')).toBe('INCOME_TAX_GOODS');
    expect(lineCategory({ accountingCategory: 'EXPENSE_TAX_GOODS' }, 'INCOME')).toBe('INCOME_TAX_SERVICES');
    expect(lineCategory({}, 'EXPENSE')).toBe('EXPENSE_UNCATEGORIZED');
  });
});

describe('entriesForPayment', () => {
  it('books a paid invoice of a non-payer as income from services, gross', () => {
    const [e] = entriesForPayment(doc(), pay(), NONPAYER);
    expect(e).toMatchObject({ id: entryId('p1', 'INCOME_TAX_SERVICES'), date: '2026-03-10', direction: 'INCOME', medium: 'BANK', amount: '123.00', vat: null, category: 'INCOME_TAX_SERVICES', taxRelevant: true, docId: 'd1', paymentId: 'p1', text: 'Odberateľ', auto: true });
  });

  it('keeps the VAT share apart for a payer, also for a partial payment', () => {
    const [e] = entriesForPayment(doc(), pay({ amount: '61.50' }), PAYER);
    expect(e.amount).toBe('61.50');
    expect(e.vat).toBe('11.50');
  });

  it('splits a payment over the line categories in proportion', () => {
    const d = doc({ lines: [line({ accountingCategory: 'INCOME_TAX_GOODS', unitPrice: '300' }), line({ id: 'l2', unitPrice: '100' })] });
    const entries = entriesForPayment(d, pay({ amount: '100' }), PAYER);
    expect(entries.map(e => [e.category, e.amount, e.vat])).toEqual([['INCOME_TAX_GOODS', '75.00', '14.02'], ['INCOME_TAX_SERVICES', '25.00', '4.68']]);
  });

  it('makes the parts add up to the payment exactly', () => {
    const d = doc({ lines: [line({ unitPrice: '1' }), line({ id: 'l2', unitPrice: '1', accountingCategory: 'INCOME_TAX_OTHER' }), line({ id: 'l3', unitPrice: '1', accountingCategory: 'INCOME_TAX_GOODS' })] });
    const entries = entriesForPayment(d, pay({ amount: '10' }), NONPAYER);
    expect(entries.map(e => e.amount).sort()).toEqual(['3.33', '3.33', '3.34']);
  });

  it('books a received invoice as an expense of the line category, cash', () => {
    const d = doc({ kind: 'RECEIVED_INVOICE', lines: [line({ accountingCategory: 'EXPENSE_TAX_MATERIAL' })] });
    const [e] = entriesForPayment(d, pay({ method: 'CASH' }), NONPAYER);
    expect(e).toMatchObject({ direction: 'EXPENSE', medium: 'CASH', category: 'EXPENSE_TAX_MATERIAL', amount: '123.00', text: 'Dodávateľ' });
  });

  it('leaves an expense without a category uncategorized', () => {
    const [e] = entriesForPayment(doc({ kind: 'EXPENSE_RECEIPT' }), pay(), NONPAYER);
    expect(e.category).toBe('EXPENSE_UNCATEGORIZED');
    expect(e.taxRelevant).toBe(false);
  });

  it('turns a refunded credit note into negative income', () => {
    const [e] = entriesForPayment(doc({ kind: 'CREDIT_NOTE' }), pay({ amount: '123' }), PAYER);
    expect(e.amount).toBe('-123.00');
    expect(e.vat).toBe('-23.00');
  });

  it('keeps a negative credit note payment negative', () => {
    const d = doc({ kind: 'CREDIT_NOTE', lines: [line({ qty: '-1' })] });
    const [e] = entriesForPayment(d, pay({ amount: '-123' }), PAYER);
    expect(e.amount).toBe('-123.00');
    expect(e.vat).toBe('-23.00');
  });

  it('converts a foreign currency payment to EUR by the document rate', () => {
    const d = doc({ currency: 'CZK', fxRate: '25', lines: [line({ unitPrice: '2500', vatCategory: 'O', vatRate: null })] });
    const [e] = entriesForPayment(d, pay({ amount: '2500' }), NONPAYER);
    expect(e.amount).toBe('100.00');
  });

  it('refuses a foreign currency without a rate', () => {
    const d = doc({ currency: 'CZK' });
    expect(() => entriesForPayment(d, pay(), NONPAYER)).toThrow(expect.objectContaining({ code: 'LEDGER_FX_RATE_MISSING' }));
  });

  it('books nothing for quotes, set-offs, deleted payments and a tax document of a proforma', () => {
    expect(entriesForPayment(doc({ kind: 'QUOTE' }), pay(), NONPAYER)).toEqual([]);
    expect(entriesForPayment(doc(), pay({ method: 'OFFSET' }), NONPAYER)).toEqual([]);
    expect(entriesForPayment(doc(), pay({ deleted: true }), NONPAYER)).toEqual([]);
    expect(paymentDirection(doc({ kind: 'ADVANCE_TAX_DOC', links: [{ kind: 'FROM_PROFORMA', docId: 'x' }] }))).toBeNull();
    expect(paymentDirection(doc({ kind: 'ADVANCE_TAX_DOC' }))).toBe('INCOME');
    expect(paymentDirection(doc({ kind: 'PROFORMA' }))).toBe('INCOME');
  });

  it('maps payment methods to cash or bank', () => {
    expect(paymentMedium('CASH')).toBe('CASH');
    expect(paymentMedium('CARD')).toBe('BANK');
    expect(paymentMedium('OFFSET')).toBeNull();
  });

  it('allocates zero weights to the first part', () => {
    expect(allocate('5', ['0', '0'])).toEqual(['5.00', '0.00']);
    expect(allocate('5', [])).toEqual([]);
  });
});

describe('planEntrySync', () => {
  const company = NONPAYER;

  it('inserts entries for new payments', () => {
    const plan = planEntrySync({ documents: [doc({ payments: [pay()] })], entries: [], company });
    expect(plan.insert).toHaveLength(1);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('updates a changed amount and removes entries of deleted payments', () => {
    const [entry] = planEntrySync({ documents: [doc({ payments: [pay()] })], entries: [], company }).insert;
    const changed = planEntrySync({ documents: [doc({ payments: [pay({ amount: '100' })] })], entries: [entry], company });
    expect(changed.update).toEqual([{ id: entry.id, patch: { amount: '100.00' } }]);
    const gone = planEntrySync({ documents: [doc({ payments: [pay({ deleted: true })] })], entries: [entry], company });
    expect(gone.remove).toEqual([entry.id]);
  });

  it('is idempotent', () => {
    const documents = [doc({ payments: [pay()] })];
    const { insert } = planEntrySync({ documents, entries: [], company });
    const again = planEntrySync({ documents, entries: insert, company });
    expect(again).toMatchObject({ insert: [], update: [], remove: [] });
  });

  it('never reuses the id of a tombstone', () => {
    const [entry] = planEntrySync({ documents: [doc({ payments: [pay()] })], entries: [], company }).insert;
    const plan = planEntrySync({ documents: [doc({ payments: [pay()] })], entries: [{ ...entry, deleted: true }], company });
    expect(plan.insert[0].id).toBe(`${entry.id}~1`);
  });

  it('leaves manual entries alone and does not book their payment again', () => {
    const manual = { id: 'm1', paymentId: 'p1', auto: false, date: '2026-03-10', direction: 'INCOME', medium: 'BANK', amount: '123', category: 'INCOME_TAX_OTHER' };
    const plan = planEntrySync({ documents: [doc({ payments: [pay()] })], entries: [manual], company });
    expect(plan).toMatchObject({ insert: [], update: [], remove: [] });
  });

  it('skips drafts and cancelled documents', () => {
    const plan = planEntrySync({ documents: [doc({ status: 'DRAFT', payments: [pay()] }), doc({ id: 'd2', status: 'CANCELLED', payments: [pay({ id: 'p2' })] })], entries: [], company });
    expect(plan.insert).toEqual([]);
  });

  it('warns about set-offs, missing categories, rates and bank lines without a document', () => {
    const documents = [
      doc({ payments: [pay({ method: 'OFFSET' })] }),
      doc({ id: 'd2', kind: 'RECEIVED_INVOICE', payments: [pay({ id: 'p2' })] }),
      doc({ id: 'd3', currency: 'USD', payments: [pay({ id: 'p3' })] })
    ];
    const bankTransactions = [
      { id: 't1', date: '2026-04-01', amount: '-50', matched: null },
      { id: 't2', date: '2026-04-02', amount: '20', matched: { docId: 'd1', confidence: 100 } },
      { id: 't3', date: '2026-04-03', amount: '-30', matched: null }
    ];
    const manual = { id: 'm', auto: false, date: '2026-04-03', direction: 'EXPENSE', medium: 'BANK', amount: '30', category: 'EXPENSE_TAX_OTHER' };
    const codes = planEntrySync({ documents, entries: [manual], company, bankTransactions }).warnings.map(w => w.code);
    expect(codes).toEqual(['PAYMENT_OFFSET', 'EXPENSE_UNCATEGORIZED', 'LEDGER_FX_RATE_MISSING', 'PAYMENT_WITHOUT_DOCUMENT']);
  });
});
