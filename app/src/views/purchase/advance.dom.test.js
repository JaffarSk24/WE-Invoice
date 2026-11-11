// @vitest-environment happy-dom
// A bill paid in advance on a proforma: confirming its invoice links the
// two, both show as paid with one payment, the card says by which advance
// and the link can be undone or made by hand.
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { amountDue } from '@we-invoice/core';
import { setLanguage } from '../../i18n/index.js';
import { createStore, memoryAdapter } from '../../store/index.js';
import { setPref } from '../../prefs.js';
import { renderReview } from './review-view.js';
import { intakeFile } from './intake.js';
import { listRows } from './data.js';
import { settleAdvances, linkAdvance } from './advances.js';
import { patchDocuments } from '../money/shared/write.js';

const read = (p) => readFileSync(`${process.cwd()}/tests/fixtures/inbox/${p}`, 'utf8');
const { company } = JSON.parse(read('cases.json'));
const today = '2026-10-18';
const flush = () => new Promise(r => setTimeout(r, 0));
const reader = (text) => async () => ({ kind: 'PDF', found: { xml: [], qr: [], text, ocrText: '' }, pages: [[]], canvases: [] });
const file = (name) => ({ name, type: 'application/xml', size: 3, arrayBuffer: async () => new TextEncoder().encode('<x/>').buffer });

let store;
let root;
beforeAll(async () => { await setLanguage('sk'); });
beforeEach(async () => {
  setPref('demo', false);
  store = createStore({ adapter: memoryAdapter(), emitter: () => {} });
  await store.open();
  await store.createCompany({ ...company });
  document.body.innerHTML = '';
  root = document.createElement('main');
  document.body.append(root);
  window.location.hash = '#/inbox';
});

async function invoiceInInbox() {
  return (await intakeFile(file('fa.xml'), { store, today, readFile: reader(read('text/sk-invoice-simple.txt')) })).doc;
}

// A paid proforma of the same supplier over the whole invoice.
async function paidProforma(invoice, extra = {}) {
  const { id, createdAt, updatedAt, inbox, ...fields } = invoice;
  void id; void createdAt; void updatedAt; void inbox;
  const amount = invoice.totals.payable;
  return store.insert('documents', {
    ...fields, kind: 'RECEIVED_PROFORMA', number: 'ZF2026007', status: 'PAID', issueDate: '2026-09-01', dueDate: '2026-09-10', inbox: null, attachments: [],
    payments: [{ id: 'pay-1', date: '2026-09-05', amount, currency: invoice.currency || 'EUR', method: 'TRANSFER', source: 'MANUAL', bankTxId: null, cashBookId: null, note: null }],
    ...extra
  });
}

describe('invoice settled by a paid proforma', () => {
  it('links the invoice on confirming, so it is paid without a second payment', async () => {
    const doc = await invoiceInInbox();
    const proforma = await paidProforma(doc);
    renderReview(root, { id: doc.id, route: 'inbox', ctx: {} });
    root.querySelector('[data-action="save"]').click();
    await flush(); await flush(); await flush();
    const saved = store.get('documents', doc.id);
    expect(saved.links).toEqual([{ kind: 'ADVANCE_PAID', docId: proforma.id, amount: doc.totals.payable }]);
    expect(saved.status).toBe('PAID');
    expect(saved.payments || []).toEqual([]);
    expect(amountDue(saved)).toBe('0.00');
    // Paid already, so no question whether the old bill is paid.
    expect(document.querySelector('.payment-lead')).toBe(null);
    expect(document.body.textContent).toContain('je uhradená zálohou ZF2026007');
    const rows = listRows(['RECEIVED_INVOICE', 'RECEIVED_PROFORMA']);
    expect(rows.find(r => r.id === doc.id).paidDate).toBe('2026-09-05');
    expect(rows.find(r => r.id === proforma.id).settled).toBe(true);
  });

  it('shows the advance on both cards and undoes the link', async () => {
    const doc = await invoiceInInbox();
    await store.update('documents', doc.id, { status: 'PROCESSED' });
    const proforma = await paidProforma(doc);
    await settleAdvances(store, doc.id, { today });
    renderReview(root, { id: doc.id, route: 'received', ctx: {} });
    const panel = root.querySelector('[data-advance="linked"]');
    expect(panel.textContent).toContain('Uhradené zálohou');
    expect(panel.querySelector('a').getAttribute('href')).toBe(`#/received/${proforma.id}`);
    root.innerHTML = '';
    renderReview(root, { id: proforma.id, route: 'received', ctx: {} });
    expect(root.querySelector('[data-advance="settled"]').textContent).toContain(doc.number);
    root.innerHTML = '';
    renderReview(root, { id: doc.id, route: 'received', ctx: {} });
    root.querySelector('[data-action="unlink-advance"]').click();
    await flush();
    expect(store.get('documents', doc.id).links).toEqual([]);
    expect(store.get('documents', doc.id).status).not.toBe('PAID');
  });

  it('offers a paid proforma by hand when the amounts differ, and links it', async () => {
    const doc = await invoiceInInbox();
    await store.update('documents', doc.id, { status: 'PROCESSED' });
    const proforma = await paidProforma(doc, { number: 'ZF-X', payments: [{ id: 'pay-2', date: '2026-09-05', amount: '10.00', currency: 'EUR', method: 'TRANSFER', source: 'MANUAL', bankTxId: null, cashBookId: null, note: null }] });
    expect(await settleAdvances(store, doc.id, { today })).toBe(null);
    renderReview(root, { id: doc.id, route: 'received', ctx: {} });
    root.querySelector('[data-action="link-advance"]').click();
    expect(document.querySelector('#advance-choice').value).toBe(proforma.id);
    document.querySelectorAll('.modal-actions button')[1].click();
    await flush();
    const saved = store.get('documents', doc.id);
    expect(saved.links).toEqual([{ kind: 'ADVANCE_PAID', docId: proforma.id, amount: '10.00' }]);
    // Ten euros are covered; the rest is still due (and past its due date).
    expect(amountDue(saved)).toBe((Number(doc.totals.payable) - 10).toFixed(2));
    expect(saved.status).toBe('OVERDUE');
  });

  it('links the pair when the proforma is paid from a bank match after the invoice came', async () => {
    const doc = await invoiceInInbox();
    await store.update('documents', doc.id, { status: 'PROCESSED' });
    const proforma = await paidProforma(doc, { payments: [], status: 'PROCESSED' });
    const amount = doc.totals.payable;
    await patchDocuments(store, [{ id: proforma.id, patch: { payments: [{ id: 'bank-1', date: '2026-09-06', amount, currency: 'EUR', method: 'TRANSFER', source: 'BANK_IMPORT', bankTxId: 'tx-1', cashBookId: null, note: null }] } }]);
    expect(store.get('documents', doc.id).links).toEqual([{ kind: 'ADVANCE_PAID', docId: proforma.id, amount }]);
  });

  it('does not link a proforma of another supplier', async () => {
    const doc = await invoiceInInbox();
    await store.update('documents', doc.id, { status: 'PROCESSED' });
    const other = await paidProforma(doc, { seller: { name: 'Iná firma s.r.o.', ico: '35757442', dic: null, icDph: null } });
    expect(await settleAdvances(store, doc.id, { today })).toBe(null);
    await expect(linkAdvance(store, store.get('documents', doc.id), other, { today })).resolves.toBeTruthy();
  });
});
