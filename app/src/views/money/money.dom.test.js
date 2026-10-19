// @vitest-environment happy-dom
// The money screens over a real store in memory: empty states, the bank
// list, confirming a match, cash books with numbered vouchers, removing a
// hand-recorded payment with its voucher, offsets and the demo data shape.
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, memoryAdapter } from '../../store/index.js';
import { resetPrefsCache, setPref } from '../../prefs.js';
import { makePayment, addPayment, matchBankTx, withImportKeys, paymentState } from '@we-invoice/core';
import { renderBank, visibleTransactions } from './bank/view.js';
import { renderCash } from './cash/view.js';
import { renderPayments } from './payments/view.js';
import { pickAccount } from './bank/import-dialog.js';
import { confirmProposal } from './bank/match-dialog.js';
import { manualProposal } from './bank/tx-dialog.js';
import { createCashBook, createVoucher, cancelVoucher } from './cash/operations.js';
import { removeManualPayment, cancelOffsetProtocol, openPaymentActions } from './payments/actions-dialog.js';
import { t } from '../../i18n/index.js';
import { offsetPartners } from './payments/offset-dialog.js';
import { moneyState, demoDocument } from './shared/data.js';
import { lazyScreen } from '../../boot/bank.js';

const ACCOUNT = { id: 'acc', name: 'Tatra', iban: 'SK3911000000002900123456', bic: 'TATRSKBX', currency: 'EUR', isDefault: true };
const invoice = (fields = {}) => ({
  kind: 'INVOICE', status: 'ISSUED', number: 'FA20260001', vs: '20260001', currency: 'EUR', issueDate: '2026-09-20', dueDate: '2026-10-04',
  buyer: { name: 'Alfa s.r.o.' }, lines: [], payments: [], totals: { net: '100.00', vat: '0.00', gross: '100.00', payable: '100.00' }, ...fields
});

async function freshStore() {
  const store = createStore({ adapter: memoryAdapter(), emitter: () => {} });
  await store.open();
  await store.createCompany({ name: 'Vzorova firma', bankAccounts: [ACCOUNT], series: [], vatMode: 'NONPAYER' });
  return store;
}

const ctx = { transport: { files: {} }, t: (k) => k, showError: () => {} };

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); resetPrefsCache(); });

describe('bank screen', () => {
  it('asks for a company first', () => {
    createStore({ adapter: memoryAdapter(), emitter: () => {} });
    const root = document.createElement('main');
    document.body.append(root);
    renderBank(root, ctx);
    expect(root.querySelector('.empty-state h2').textContent).toBe('Create your company first');
  });

  it('lists the movements and their matching state', async () => {
    const store = await freshStore();
    const [tx] = withImportKeys(ACCOUNT.id, [{ date: '2026-10-05', amount: '100.00', currency: 'EUR', counterpartyName: 'Alfa s.r.o.', vs: '20260001', ref: 'r1' }]);
    await store.insert('bankTransactions', { ...tx, matched: null });
    const root = document.createElement('main');
    document.body.append(root);
    renderBank(root, ctx);
    expect(root.querySelector('.view-header h1').textContent).toBe('Bank');
    expect(root.textContent).toContain('Alfa s.r.o.');
    expect(root.textContent).toContain('Unmatched');
    expect(visibleTransactions(moneyState(), { unmatchedOnly: true })).toHaveLength(1);
  });

  it('confirming a proposal pays the invoice and marks the movement', async () => {
    const store = await freshStore();
    const doc = await store.insert('documents', invoice());
    const [raw] = withImportKeys(ACCOUNT.id, [{ date: '2026-10-05', amount: '100.00', currency: 'EUR', vs: '20260001', ref: 'r1' }]);
    const tx = await store.insert('bankTransactions', { ...raw, matched: null });
    const [proposal] = matchBankTx(tx, store.list('documents'));
    await confirmProposal(store, tx.id, proposal);
    expect(store.get('documents', doc.id).status).toBe('PAID');
    expect(store.get('bankTransactions', tx.id).matched).toMatchObject({ docId: doc.id, confirmed: true });
    expect(visibleTransactions(moneyState(), { unmatchedOnly: true })).toHaveLength(0);
  });

  it('a hand-picked document takes the whole movement', () => {
    const p = manualProposal({ amount: '-30.00' }, { id: 'd' }, '50.00');
    expect(p).toMatchObject({ kind: 'PARTIAL', allocations: [{ docId: 'd', amount: '30.00' }], reasons: ['MANUAL'] });
  });

  it('picks the account of the statement, else the preferred or default one', () => {
    const other = { ...ACCOUNT, id: 'b', iban: 'SK0902000000004400112233', isDefault: false };
    expect(pickAccount([ACCOUNT, other], 'SK0902000000004400112233', null).id).toBe('b');
    expect(pickAccount([ACCOUNT, other], null, 'b').id).toBe('b');
    expect(pickAccount([other, ACCOUNT], null, null).id).toBe('acc');
    expect(pickAccount([], null, null)).toBeNull();
  });
});

describe('cash desk', () => {
  it('creates a book with its series and numbers vouchers', async () => {
    const store = await freshStore();
    const book = await createCashBook(store, { name: 'Hlavna', currency: 'EUR', openingBalance: '50' });
    expect(store.company().series.map(s => s.kind)).toEqual(['CASH_IN', 'CASH_OUT']);
    const a = await createVoucher(store, { bookId: book.id, kind: 'CASH_IN', date: '2026-10-01', amount: '10', purpose: 'A' });
    const b = await createVoucher(store, { bookId: book.id, kind: 'CASH_IN', date: '2026-10-02', amount: '5', purpose: 'B' });
    const c = await createVoucher(store, { bookId: book.id, kind: 'CASH_OUT', date: '2026-10-03', amount: '7', purpose: 'C' });
    expect([a.number, b.number, c.number]).toEqual(['PPD20260001', 'PPD20260002', 'VPD20260001']);
    const root = document.createElement('main');
    document.body.append(root);
    setPref('density', 'comfortable');
    renderCash(root, ctx);
    expect(root.querySelector('.cash-balance').textContent).toContain('58');
  });

  it('cancelling a voucher that paid a document removes that payment', async () => {
    const store = await freshStore();
    const book = await createCashBook(store, { name: 'Hlavna' });
    const doc = await store.insert('documents', invoice());
    const payment = makePayment(doc, { date: '2026-10-05', amount: '100', method: 'CASH', source: 'CASH', cashBookId: book.id });
    await store.update('documents', doc.id, addPayment(doc, payment));
    const voucher = await createVoucher(store, { bookId: book.id, kind: 'CASH_IN', date: '2026-10-05', amount: '100', purpose: 'x', paysDocId: doc.id, paymentId: payment.id });
    expect(store.get('documents', doc.id).status).toBe('PAID');
    await cancelVoucher(store, voucher.id);
    expect(store.get('documents', voucher.id).status).toBe('CANCELLED');
    expect(store.get('documents', doc.id).payments).toEqual([]);
    expect(store.get('documents', doc.id).status).toBe('ISSUED');
  });
});

describe('payments', () => {
  it('removing a hand payment cancels its voucher too', async () => {
    const store = await freshStore();
    const book = await createCashBook(store, { name: 'Hlavna' });
    const doc = await store.insert('documents', invoice());
    const payment = makePayment(doc, { date: '2026-10-05', amount: '40', method: 'CASH', source: 'CASH', cashBookId: book.id });
    await store.update('documents', doc.id, addPayment(doc, payment));
    const voucher = await createVoucher(store, { bookId: book.id, kind: 'CASH_IN', date: '2026-10-05', amount: '40', purpose: 'x', paysDocId: doc.id, paymentId: payment.id });
    await removeManualPayment(store, doc.id, payment.id);
    expect(store.get('documents', doc.id).payments).toEqual([]);
    expect(store.get('documents', voucher.id).status).toBe('CANCELLED');
  });

  it('offers the eKasa helper for a cash payment unless the company does not use eKasa', async () => {
    const store = await freshStore();
    const doc = await store.insert('documents', invoice());
    const payment = makePayment(doc, { date: '2026-10-05', amount: '40', method: 'CASH', source: 'MANUAL' });
    await store.update('documents', doc.id, addPayment(doc, payment));
    const labels = () => [...document.querySelectorAll('.modal-actions button')].map(b => b.textContent);
    openPaymentActions(ctx, doc.id, payment.id);
    expect(labels()).toContain(t('bank.ekasa.title'));
    document.body.innerHTML = '';
    await store.updateCompany({ ekasaExempt: true });
    openPaymentActions(ctx, doc.id, payment.id);
    expect(labels()).not.toContain(t('bank.ekasa.title'));
  });

  it('lists the payments on the screen', async () => {
    const store = await freshStore();
    const doc = await store.insert('documents', invoice({ issueDate: '2026-01-10' }));
    const today = new Date().toISOString().slice(0, 10);
    await store.update('documents', doc.id, addPayment(doc, makePayment(doc, { date: today, amount: '100' })));
    const root = document.createElement('main');
    document.body.append(root);
    renderPayments(root, ctx);
    expect(root.textContent).toContain('FA20260001');
    expect(root.textContent).toContain('Bank transfer');
  });

  it('finds partners for an offset and cancels one', async () => {
    const store = await freshStore();
    const contact = await store.insert('contacts', { kind: 'COMPANY', name: 'Alfa' });
    await store.insert('documents', invoice({ contactId: contact.id }));
    await store.insert('documents', invoice({ kind: 'RECEIVED_INVOICE', status: 'PROCESSED', number: 'PF1', contactId: contact.id, seller: { name: 'Alfa' }, totals: { net: '60', vat: '0', gross: '60', payable: '60.00' } }));
    const partners = offsetPartners(moneyState());
    expect(partners).toHaveLength(1);
    expect(partners[0].candidates.possible).toBe('60.00');
    const { buildOffset, planOffset } = await import('@we-invoice/core');
    const plan = planOffset(store.list('documents'), { contactId: contact.id });
    const result = buildOffset(store.list('documents'), { plan, date: '2026-10-10', contact });
    await store.insert('documents', result.protocol);
    for (const { id, patch } of result.documents) await store.update('documents', id, patch);
    expect(store.list('documents').filter(d => d.payments?.some(p => p.method === 'OFFSET'))).toHaveLength(2);
    await cancelOffsetProtocol(store, result.protocol.id);
    expect(store.get('documents', result.protocol.id).status).toBe('CANCELLED');
    expect(store.list('documents').filter(d => d.payments?.length)).toHaveLength(0);
  });
});

describe('demo mode and start-up', () => {
  it('shapes demo summaries like stored documents', () => {
    const doc = demoDocument({ id: 'x', kind: 'INVOICE', number: 'FA20260003', status: 'PARTIALLY_PAID', issueDate: '2026-01-01', dueDate: '2026-01-15', currency: 'EUR', contactName: 'Beta', totalNet: '100.00', totalVat: '23.00', totalGross: '123.00', paidAmount: '49.20' });
    expect(doc.vs).toBe('20260003');
    expect(doc.buyer.name).toBe('Beta');
    expect(paymentState(doc)).toBe('PARTIAL');
  });

  it('the demo is read-only and has no bank lines', () => {
    setPref('demo', true);
    const state = moneyState();
    expect(state).toMatchObject({ demo: true, readOnly: true, bankTransactions: [], cashBooks: [] });
    expect(state.documents.length).toBeGreaterThan(0);
    setPref('demo', false);
  });

  it('a screen loads its code lazily and reports a failed load', async () => {
    const errors = [];
    const root = document.createElement('div');
    await lazyScreen(() => Promise.resolve((r) => r.append('ok')), { t: (k) => k, showError: (e) => errors.push(e) })(root, 'bank');
    expect(root.textContent).toBe('ok');
    await lazyScreen(() => Promise.reject(new Error('boom')), { t: (k) => k, showError: (e) => errors.push(e) })(root, 'bank');
    expect(errors).toHaveLength(1);
  });
});
