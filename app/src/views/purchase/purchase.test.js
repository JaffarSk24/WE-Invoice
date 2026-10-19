// The purchase logic around the store: Inbox intake with a stubbed file
// reader, the review values (checks and rebuilt amounts), confirming a
// document (supplier remembered and applied to the next document),
// payments, deletion and the list helpers.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createStore, memoryAdapter } from '../../store/index.js';
import { intakeFile, recentRead } from './intake.js';
import { valuesOf, validateValues, applyValues, breakdownFor } from './review-values.js';
import { saveDocument, recordPayment, deleteDocument, blankDocument } from './review-actions.js';
import { inboxQueue, processedDocuments, rowOf, receivedStatus, withPayment, listRows } from './data.js';
import { categorySummary } from './summary.js';
import { filterRows } from './list-view.js';
import { routeParts, docHash } from './routes.js';
import { getFile } from './file-store.js';

const dir = new URL('../../../../tests/fixtures/inbox/', import.meta.url);
const read = (p) => readFileSync(new URL(p, dir), 'utf8');
const { company } = JSON.parse(read('cases.json'));
const today = '2026-10-18';

const fileOf = (name, text, type = 'application/pdf') => ({
  name, type, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer
});
const textReader = (text, extra = {}) => async () => ({ kind: 'PDF', found: { xml: [], qr: [], text, ocrText: '', ...extra }, pages: [[]], canvases: [] });

let store;
beforeEach(async () => {
  store = createStore({ adapter: memoryAdapter(), emitter: () => {} });
  await store.open();
  await store.createCompany({ ...company });
});

describe('Inbox intake', () => {
  it('stores a recognised PDF as a document to process with its file', async () => {
    const { doc } = await intakeFile(fileOf('fa.pdf', 'x'), { store, today, lineName: 'Nákup', readFile: textReader(read('text/sk-invoice-simple.txt')) });
    expect(doc).toMatchObject({ kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS', number: '2026105', receivedDate: today });
    expect(doc.inbox.needsConfirmation).toBe(true);
    expect(inboxQueue(store).map(d => d.id)).toEqual([doc.id]);
    expect(recentRead(doc.id).kind).toBe('PDF');
    expect((await getFile(doc.attachments[0].id)).name).toBe('fa.pdf');
  });

  it('refuses files over the limit', async () => {
    await expect(intakeFile({ ...fileOf('big.pdf', 'x'), size: 30 * 1024 * 1024 }, { store, today, readFile: textReader('') }))
      .rejects.toMatchObject({ code: 'INBOX_FILE_TOO_LARGE' });
  });

  it('completes an online eKasa receipt through the gateway', async () => {
    const receipt = JSON.parse(read('qr/ekasa-receipt.json'));
    const transport = {
      gatewayUrl: (p) => `https://gw${p}`,
      http: async (req) => ({ ok: true, status: 200, json: async () => { expect(JSON.parse(req.body).receiptId).toBe(receipt.receiptId); return receipt; } })
    };
    const { doc, warnings } = await intakeFile(fileOf('blocek.jpg', 'x', 'image/jpeg'), {
      store, today, transport, readFile: textReader('', { qr: [receipt.receiptId] })
    });
    expect(warnings).toEqual([]);
    expect(doc).toMatchObject({ kind: 'EXPENSE_RECEIPT', number: receipt.receiptId });
    expect(doc.seller.ico).toBe('36987123');
    expect(doc.totals.payable).toBe('81.93');
  });

  it('keeps going when the eKasa lookup fails', async () => {
    const transport = { gatewayUrl: (p) => p, http: async () => ({ ok: false, status: 404, json: async () => ({}) }) };
    const { doc, warnings } = await intakeFile(fileOf('b.png', 'x', 'image/png'), { store, today, transport, readFile: textReader('', { qr: ['O-7DBCDA8A56EE426DBCDA8A56EE426D1A'] }) });
    expect(warnings).toEqual(['EKASA_RECEIPT_NOT_FOUND']);
    expect(doc.kind).toBe('EXPENSE_RECEIPT');
  });
});

describe('review values', () => {
  const base = () => blankDocument('RECEIVED_INVOICE', { company: store.company(), today });

  it('checks required fields, identifiers, symbols and sums', () => {
    const v = { ...valuesOf(base()), supplierName: '', ico: '12345678', iban: 'SK00', vs: '12a', total: '', issueDate: '' };
    expect(validateValues(v)).toMatchObject({ supplierName: 'purchase.error.required', ico: 'purchase.error.ico', iban: 'purchase.error.iban', vs: 'purchase.error.vs', total: 'purchase.error.required', issueDate: 'purchase.error.required' });
    const bad = { ...valuesOf(base()), supplierName: 'A', issueDate: today, net: '100', vat: '23', total: '130', vatDeductionPeriod: '2026-13' };
    expect(validateValues(bad)).toMatchObject({ total: 'purchase.error.sum', vatDeductionPeriod: 'purchase.error.period' });
    expect(validateValues({ ...bad, total: '123,00', vatDeductionPeriod: '2026-Q4' })).toEqual({});
    expect(validateValues({ ...bad, kind: 'EXPENSE_RECEIPT', total: '123' })).toMatchObject({ paymentMethod: 'purchase.error.paymentMethod' });
  });

  it('rebuilds lines and totals from edited amounts at the implied rate', () => {
    const doc = applyValues(base(), { ...valuesOf(base()), supplierName: 'Alfa', icDph: 'sk2030556605', issueDate: today, net: '100,00', vat: '23,00', total: '123,00', category: 'SERVICES' }, { company: store.company() });
    expect(doc.seller).toMatchObject({ name: 'Alfa', icDph: 'SK2030556605', vatPayer: true });
    expect(doc.lines).toEqual([expect.objectContaining({ unitPrice: '100.00', vatRate: '23', accountingCategory: 'EXPENSE_TAX_SERVICES' })]);
    expect(doc.expenseCategory).toBe('SERVICES');
    expect(doc.totals).toMatchObject({ net: '100.00', vat: '23.00', payable: '123.00' });
    expect(doc.vatDeductionPeriod).toBe('2026-10');
  });

  it('keeps a breakdown that still adds up and derives odd rates', () => {
    const old = [{ category: 'S', rate: '23', base: '50.00', vat: '11.50' }, { category: 'S', rate: '5', base: '50.00', vat: '2.50' }];
    expect(breakdownFor(old, '100.00', '14.00', true)).toBe(old);
    expect(breakdownFor(old, '100.00', '0.00', false)).toEqual([{ category: 'O', rate: '0', base: '100.00', vat: '0.00' }]);
    expect(breakdownFor(null, '100.00', '12.34', true)[0].rate).toBe('12.34');
  });
});

describe('confirming, paying and deleting', () => {
  async function confirmed() {
    const { doc } = await intakeFile(fileOf('fa.pdf', 'x'), { store, today, readFile: textReader(read('text/sk-invoice-simple.txt')) });
    const values = { ...valuesOf(doc), category: 'SERVICES', paymentMethod: 'TRANSFER' };
    return saveDocument(store, doc, values, { regions: { number: { page: 1, x: 0.5, y: 0.1, w: 0.2, h: 0.02 } }, today });
  }

  it('moves the document out of the Inbox and remembers the supplier', async () => {
    const saved = await confirmed();
    // Due on 2026-10-15, so already overdue on the 18th.
    expect(saved.status).toBe('OVERDUE');
    expect(saved.inbox.needsConfirmation).toBe(false);
    expect(inboxQueue(store)).toEqual([]);
    expect(processedDocuments(store, ['RECEIVED_INVOICE']).map(d => d.id)).toEqual([saved.id]);
    const contact = store.get('contacts', saved.contactId);
    expect(contact).toMatchObject({ name: 'Účtovníctvo Pro s.r.o.', ico: '51234564', iban: 'SK9156000000001234567890' });
    expect(contact.purchaseTemplate).toMatchObject({ category: 'SERVICES', paymentMethod: 'TRANSFER', uses: 1 });
    expect(contact.purchaseTemplate.regions.number.x).toBe(0.5);
  });

  it('applies the template to the next document of the supplier', async () => {
    await confirmed();
    const text = `${read('text/sk-invoice-simple.txt')}\n`;
    const { doc } = await intakeFile(fileOf('fa2.pdf', 'x'), {
      store, today, readFile: async () => ({ kind: 'PDF', found: { xml: [], qr: [], text, ocrText: '' }, pages: [[{ str: 'FA-NEXT-9', page: 1, x: 0.52, y: 0.105, w: 0.1, h: 0.01 }]], canvases: [] })
    });
    expect(doc.number).toBe('FA-NEXT-9');
    expect(doc.inbox.sources.number).toBe('template');
    expect(doc.expenseCategory).toBe('SERVICES');
    expect(doc.lines[0].accountingCategory).toBe('EXPENSE_TAX_SERVICES');
    expect(doc.contactId).toBeTruthy();
    expect(store.list('contacts')).toHaveLength(1);
  });

  it('records payments and derives the status', async () => {
    const saved = await confirmed();
    const partly = await recordPayment(store, saved, { date: today, amount: '100', method: 'TRANSFER' }, today);
    expect(partly.status).toBe('OVERDUE');
    expect(receivedStatus({ ...partly, dueDate: '2026-10-30' }, today)).toBe('PARTIALLY_PAID');
    const paid = await recordPayment(store, partly, { date: today, amount: '121.40', method: 'CASH' }, today);
    expect(paid.status).toBe('PAID');
    expect(paid.payments[1]).toMatchObject({ source: 'CASH', currency: 'EUR', amount: '121.40' });
    expect(receivedStatus({ ...saved, dueDate: '2026-10-01' }, today)).toBe('OVERDUE');
    expect(receivedStatus({ ...saved, status: 'BOOKED' }, today)).toBe('BOOKED');
  });

  it('deletes the document and its file', async () => {
    const saved = await confirmed();
    await deleteDocument(store, saved);
    expect(store.get('documents', saved.id)).toBeNull();
    expect(await getFile(saved.attachments[0].id)).toBeNull();
  });

  it('inserts a document typed in by hand', async () => {
    const doc = blankDocument('EXPENSE_RECEIPT', { company: store.company(), today });
    const saved = await saveDocument(store, doc, { ...valuesOf(doc), supplierName: 'Obchod', issueDate: today, total: '10,00', paymentMethod: 'CASH' }, { isNew: true, today });
    expect(saved).toMatchObject({ kind: 'EXPENSE_RECEIPT', status: 'PROCESSED', paymentMethod: 'CASH' });
    expect(saved.totals.payable).toBe('10.00');
  });
});

describe('list helpers', () => {
  it('builds rows, filters them and sums expenses by category', () => {
    const doc = { id: 'd', kind: 'EXPENSE_RECEIPT', status: 'PROCESSED', number: '1', seller: { name: 'Pumpa' }, issueDate: '2026-10-01', currency: 'EUR',
      totals: { payable: '12.30', vat: '2.30', breakdown: [{ category: 'S', rate: '23', base: '10.00', vat: '2.30' }] }, expenseCategory: 'FUEL', lines: [{ kind: 'ITEM', accountingCategory: 'EXPENSE_TAX_OVERHEAD' }], payments: [] };
    const row = rowOf(doc, today);
    expect(row).toMatchObject({ supplier: 'Pumpa', total: '12.30', category: 'FUEL', status: 'PROCESSED' });
    expect(filterRows([row], { from: '2026-10-01', to: '2026-10-31', contact: 'pum' })).toHaveLength(1);
    expect(filterRows([row], { from: '2026-11-01', to: '2026-11-30' })).toHaveLength(0);
    expect(filterRows([row], { status: 'PAID' })).toHaveLength(0);
    expect(categorySummary([row, { ...row, id: 'e' }, { ...row, status: 'CANCELLED' }])).toEqual([{ category: 'FUEL', currency: 'EUR', total: '24.60', deductibleVat: '4.60' }]);
    expect(withPayment(doc, { date: today, amount: '12.3', method: 'CARD' }, today).status).toBe('PAID');
    expect(listRows(['EXPENSE_RECEIPT'])).toEqual([]);
  });

  it('reads ids from the hash', () => {
    expect(routeParts('#/received/abc')).toEqual({ name: 'received', id: 'abc', action: null });
    expect(routeParts('#/inbox')).toEqual({ name: 'inbox', id: null, action: null });
    expect(docHash('expenses', 'a b')).toBe('expenses/a%20b');
  });
});
