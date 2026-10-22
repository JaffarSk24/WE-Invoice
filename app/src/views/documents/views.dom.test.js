// @vitest-environment happy-dom
// The sales screens over a memory store: the list with its empty state
// and rows, the editor refusing an incomplete invoice at its fields,
// issuing without the autosave overwriting the issued document, the card
// with its actions, and the start-up events.
import { on } from '../../events.js';
import { t } from '../../i18n/index.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createStore, memoryAdapter } from '../../store/index.js';
import { renderDocumentList } from './list-view.js';
import { salesRoute } from './route-view.js';
import { renderEditor } from '../editor/view.js';
import { newDraft } from '../editor/draft.js';
import { boot, openNew } from '../../boot/sales-documents.js';
import { addAttachments } from '../editor/attachments.js';
import { setPref } from '../../prefs.js';
import { COMPANY, CONTACT } from './fixtures.js';

const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
let store;

async function freshStore() {
  store = createStore({ adapter: memoryAdapter(), emitter: () => {} });
  await store.open();
  await store.createCompany(structuredClone(COMPANY));
  return store;
}

function filledDraft(contact) {
  const d = newDraft({ kind: 'INVOICE', company: store.company(), contact, today: '2026-10-18' });
  d.lines[0] = { ...d.lines[0], name: 'Work', qty: '2', unitPrice: '100' };
  return d;
}

beforeEach(async () => {
  setPref('demo', false);
  // As the app page: frames may not load blob URLs, so no PDF is built here.
  document.head.innerHTML = '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'; frame-src https://accounts.google.com">';
  document.body.innerHTML = '';
  window.location.hash = '#/invoices';
  await freshStore();
});

describe('sales list', () => {
  it('copies the one selected invoice into a draft and opens it for editing', async () => {
    const contact = await store.insert('contacts', structuredClone(CONTACT));
    const first = await store.insert('documents', { ...filledDraft(contact), status: 'ISSUED', number: 'FA20260001' });
    await store.insert('documents', { ...filledDraft(contact), status: 'ISSUED', number: 'FA20260002' });
    const root = document.createElement('main');
    document.body.append(root);
    renderDocumentList(root, 'invoices');
    const box = (i) => root.querySelectorAll('.data-table tbody tr.row .col-select input')[i];
    const copyButton = () => [...root.querySelectorAll('.bulk-bar button')].find(b => b.textContent.includes(t('documents.action.copy')));
    box(0).click();
    expect(copyButton()).toBeDefined();
    box(1).click();
    expect(copyButton()).toBeUndefined();
    box(1).click();
    const chosen = store.list('documents').find(d => d.number === root.querySelector('.data-table tbody tr.row').textContent.match(/FA2026000\d/)[0]);
    copyButton().click();
    await tick(10);
    const docs = store.list('documents');
    expect(docs).toHaveLength(3);
    const copy = docs.find(d => d.status === 'DRAFT');
    expect(copy).toMatchObject({ kind: 'INVOICE', number: null, contactId: contact.id });
    expect(copy.lines.map(l => l.name)).toEqual(chosen.lines.map(l => l.name));
    expect(copy.id).not.toBe(first.id);
    expect(window.location.hash).toContain(copy.id);
    expect(window.location.hash).toContain('edit');
  });

  it('shows one main action when empty and the rows with totals otherwise', async () => {
    const root = document.createElement('main');
    document.body.append(root);
    renderDocumentList(root, 'invoices');
    expect(root.querySelector('.documents-empty .empty-state h2').textContent).toBeTruthy();
    expect(root.querySelector('.documents-list').hidden).toBe(true);

    const contact = await store.insert('contacts', structuredClone(CONTACT));
    await store.insert('documents', { ...filledDraft(contact), status: 'ISSUED', number: 'FA20260001' });
    const again = document.createElement('main');
    document.body.append(again);
    renderDocumentList(again, 'invoices');
    expect(again.querySelector('.documents-list').hidden).toBe(false);
    expect(again.querySelector('.data-table').textContent).toContain('FA20260001');
    expect(again.querySelector('[data-new-kind="INVOICE"]')).not.toBeNull();
  });
});

describe('editor', () => {
  it('points at the missing particulars instead of issuing', async () => {
    const root = document.createElement('main');
    document.body.append(root);
    renderEditor(root, { route: 'invoices', kind: 'INVOICE' });
    root.querySelector('#editor-issue').click();
    await tick(20);
    expect(root.querySelector('#editor-missing')).not.toBeNull();
    expect(root.querySelector('.editor-party').classList.contains('field-invalid')).toBe(true);
    expect(store.list('documents').every(d => d.status === 'DRAFT')).toBe(true);
  });

  it('edits the number of an issued invoice, refusing one the series already has, and the VS follows', async () => {
    const contact = await store.insert('contacts', structuredClone(CONTACT));
    const base = { ...filledDraft(contact), status: 'ISSUED', seriesId: 's1' };
    await store.insert('documents', { ...base, id: undefined, number: '20260040', vs: '20260040' });
    const doc = await store.insert('documents', { ...filledDraft(contact), status: 'ISSUED', seriesId: 's1', number: '20260041', vs: '20260041' });
    const root = document.createElement('main');
    document.body.append(root);
    const leave = renderEditor(root, { route: 'invoices', kind: 'INVOICE', doc });
    const number = root.querySelector('#editor-number');
    expect(number.value).toBe('20260041');
    number.value = '20260040';
    number.dispatchEvent(new Event('change'));
    expect(number.closest('.field').textContent).toContain(t('documents.editor.errors.numberTaken'));
    number.value = '20260045';
    number.dispatchEvent(new Event('change'));
    expect(root.querySelector('#editor-vs').value).toBe('20260045');
    root.querySelector('#editor-save').click();
    await tick(30);
    leave();
    expect(store.get('documents', doc.id)).toMatchObject({ number: '20260045', vs: '20260045', status: 'ISSUED' });
  });

  it('issues a draft and leaving the editor does not write the draft back', async () => {
    const contact = await store.insert('contacts', structuredClone(CONTACT));
    const draft = await store.insert('documents', filledDraft(contact));
    const root = document.createElement('main');
    document.body.append(root);
    const leave = renderEditor(root, { route: 'invoices', kind: 'INVOICE', doc: draft });
    root.querySelector('#editor-issue').click();
    await tick(30);
    leave();
    await tick(30);
    const stored = store.get('documents', draft.id);
    expect(stored).toMatchObject({ status: 'ISSUED', number: 'FA20260001' });
    expect(window.location.hash).toBe(`#/invoices/${draft.id}`);
  });
});

describe('route and card', () => {
  it('opens a draft in the editor and an issued document in its card', async () => {
    const contact = await store.insert('contacts', structuredClone(CONTACT));
    const draft = await store.insert('documents', filledDraft(contact));
    const issued = await store.insert('documents', { ...filledDraft(contact), status: 'ISSUED', number: 'FA20260009', seller: { name: 'Alfa' } });
    const render = salesRoute({ transport: null });
    const a = document.createElement('main');
    document.body.append(a);
    window.location.hash = `#/invoices/${draft.id}`;
    render(a, 'invoices');
    await vi.waitFor(() => expect(a.querySelector('#editor-issue')).not.toBeNull());
    const b = document.createElement('main');
    document.body.append(b);
    window.location.hash = `#/invoices/${issued.id}`;
    render(b, 'invoices');
    await vi.waitFor(() => expect(b.querySelector('#detail-add-payment')).not.toBeNull());
    expect(b.querySelector('h1').textContent).toContain('FA20260009');
    const asked = [];
    const stop = on('recurring:from-document', (p) => asked.push(p.documentId));
    b.querySelector('#detail-recurring').click();
    stop();
    expect(asked).toEqual([issued.id]);
    const c = document.createElement('main');
    document.body.append(c);
    window.location.hash = '#/invoices/missing';
    render(c, 'invoices');
    expect(c.querySelector('.detail a.btn')).not.toBeNull();
  });
});

describe('eKasa hint on the card', () => {
  async function cardWithCashPayment() {
    const contact = await store.insert('contacts', structuredClone(CONTACT));
    const doc = await store.insert('documents', {
      ...filledDraft(contact), status: 'ISSUED', number: 'FA20260003', seller: { name: 'Alfa' },
      payments: [{ id: 'p1', date: '2026-10-18', amount: '50.00', currency: 'EUR', method: 'CASH', source: 'CASH' }]
    });
    const root = document.createElement('main');
    document.body.append(root);
    window.location.hash = `#/invoices/${doc.id}`;
    salesRoute({ transport: null })(root, 'invoices');
    return root;
  }

  it('offers the VRP2 data for a cash payment by default', async () => {
    const root = await cardWithCashPayment();
    expect(root.querySelector('.payment-row .payment-tools .btn-sm')).not.toBeNull();
  });

  it('hides it when the company does not use eKasa', async () => {
    await store.updateCompany({ ekasaExempt: true });
    const root = await cardWithCashPayment();
    expect(root.querySelector('.payment-row')).not.toBeNull();
    expect(root.querySelector('.payment-row .payment-tools .btn-sm:not(.btn-icon)')).toBeNull();
  });
});

describe('attachments on the card', () => {
  it('lists the files and removes one from an issued document only after a confirmation', async () => {
    const contact = await store.insert('contacts', structuredClone(CONTACT));
    const doc = await store.insert('documents', { ...filledDraft(contact), status: 'ISSUED', number: 'FA20260004', seller: { name: 'Alfa' } });
    const bytes = { name: 'zmluva.pdf', type: 'application/pdf', size: 3, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    await addAttachments(store, doc.id, [bytes]);
    const root = document.createElement('main');
    document.body.append(root);
    window.location.hash = `#/invoices/${doc.id}`;
    salesRoute({ transport: null })(root, 'invoices');
    // The card loads on first use.
    for (let i = 0; i < 100 && !root.querySelector('.doc-attachments'); i += 1) await tick(10);
    expect(root.querySelector('.doc-attachments .attachment-name').textContent).toBe('zmluva.pdf');
    expect(root.querySelector('#attachment-add')).not.toBeNull();

    root.querySelector('.attachment-remove').click();
    const confirm = document.querySelector('.modal-content .btn-danger');
    expect(confirm).not.toBeNull();
    expect(store.get('documents', doc.id).attachments).toHaveLength(1);
    confirm.click();
    await tick(30);
    expect(store.get('documents', doc.id).attachments).toEqual([]);
    expect(store.list('auditLog').some(e => e.entityId === doc.id && e.reason === 'attachment removed')).toBe(true);
  });
});

describe('start-up', () => {
  it('registers the sales routes and opens the editor on document:new', async () => {
    const routes = new Map();
    const handlers = new Map();
    await boot({ registerRoute: (name, fn) => routes.set(name, fn), transport: null, on: (ev, fn) => handlers.set(ev, fn) });
    expect([...routes.keys()]).toEqual(['invoices', 'proformas', 'credit-notes', 'quotes', 'orders', 'delivery-notes']);
    handlers.get('document:new')({ kind: 'QUOTE', contactId: 'c1' });
    expect(window.location.hash).toBe('#/quotes/new?kind=QUOTE&contact=c1');
    handlers.get('document:new')({ kind: 'EXPENSE_RECEIPT' });
    expect(window.location.hash).toBe('#/quotes/new?kind=QUOTE&contact=c1');
    expect(openNew('RECEIVED_INVOICE')).toBe(false);
  });
});
