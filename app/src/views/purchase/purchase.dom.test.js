// @vitest-environment happy-dom
// The purchase screens in a DOM: the Inbox with its drop zone and queue,
// the review (unsure fields marked, checks before saving, confirming),
// the lists with the expense summary, and demo mode writing nothing.
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { setLanguage } from '../../i18n/index.js';
import { createStore, memoryAdapter } from '../../store/index.js';
import { setPref } from '../../prefs.js';
import { renderInbox, handleFiles } from './inbox-view.js';
import { renderReview } from './review-view.js';
import { renderList } from './list-view.js';
import { LISTS, inboxRoute } from './index.js';
import { intakeFile } from './intake.js';
import { createDropZone } from './drop-zone.js';

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

async function inboxDoc(text = read('text/sk-invoice-simple.txt')) {
  return (await intakeFile(file('fa.xml'), { store, today, readFile: reader(text) })).doc;
}

describe('Inbox screen', () => {
  it('shows the drop zone and the empty queue', () => {
    renderInbox(root, { transport: null });
    expect(root.querySelector('h1').textContent).toBe('Inbox');
    expect(root.querySelector('.inbox-drop [data-action="choose"]')).toBeTruthy();
    expect(root.querySelector('.inbox-drop input[type="file"][accept*="pdf"]')).toBeTruthy();
    expect(root.querySelector('.table-empty').hidden).toBe(false);
  });

  it('lists documents waiting in the queue', async () => {
    await inboxDoc();
    inboxRoute({ transport: null })(root);
    expect(root.querySelector('.table-empty').hidden).toBe(true);
    expect(root.textContent).toContain('Účtovníctvo Pro s.r.o.');
  });

  it('writes nothing in demo mode', async () => {
    setPref('demo', true);
    const list = document.createElement('ul');
    expect(await handleFiles([file('a.xml')], { transport: null, progressList: list })).toEqual([]);
    expect(store.list('documents')).toEqual([]);
    expect(document.body.textContent).toContain('ukážkovom');
  });

  it('hands dropped files to the callback', () => {
    const onFiles = vi.fn();
    const zone = createDropZone({ onFiles });
    document.body.append(zone);
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    drop.dataTransfer = { files: [file('a.xml')] };
    zone.dispatchEvent(drop);
    expect(onFiles).toHaveBeenCalledWith([expect.objectContaining({ name: 'a.xml' })]);
  });
});

describe('review', () => {
  it('marks unsure fields and refuses a wrong IČO', async () => {
    const doc = await inboxDoc();
    renderReview(root, { id: doc.id, route: 'inbox', ctx: {} });
    expect(root.querySelector('h1').textContent).toContain('2026105');
    expect(root.querySelector('.review-notice')).toBeTruthy();
    expect(root.querySelector('.field[data-field="supplierName"]').classList.contains('field-low')).toBe(true);
    expect(root.querySelector('[data-pick="ico"]')).toBeTruthy();
    const ico = root.querySelector('input[data-field="ico"]');
    ico.value = '12345678';
    root.querySelector('[data-action="save"]').click();
    await flush();
    expect(ico.getAttribute('aria-invalid')).toBe('true');
    expect(store.get('documents', doc.id).status).toBe('TO_PROCESS');
  });

  it('confirms a document into the received list', async () => {
    const doc = await inboxDoc();
    renderReview(root, { id: doc.id, route: 'inbox', ctx: {} });
    root.querySelector('select[data-field="category"]').value = 'SERVICES';
    root.querySelector('[data-action="save"]').click();
    await flush(); await flush();
    const saved = store.get('documents', doc.id);
    expect(saved.status).not.toBe('TO_PROCESS');
    expect(saved.lines[0].accountingCategory).toBe('SERVICES');
    expect(window.location.hash).toBe('#/received');
  });

  it('shows a missing document', () => {
    renderReview(root, { id: 'nope', route: 'received', ctx: {} });
    expect(root.querySelector('.empty-state h2').textContent).toBe('Doklad sa nenašiel');
  });

  it('opens a blank receipt and requires the payment method', async () => {
    renderReview(root, { id: 'new', route: 'expenses', ctx: {}, newKind: 'EXPENSE_RECEIPT' });
    expect(root.querySelector('select[data-field="kind"]').value).toBe('EXPENSE_RECEIPT');
    root.querySelector('input[data-field="supplierName"]').value = 'Obchod';
    root.querySelector('input[data-field="issueDate"]').value = today;
    root.querySelector('input[data-field="total"]').value = '9,90';
    root.querySelector('[data-action="save"]').click();
    await flush();
    expect(root.querySelector('select[data-field="paymentMethod"]').getAttribute('aria-invalid')).toBe('true');
    root.querySelector('select[data-field="paymentMethod"]').value = 'CARD';
    root.querySelector('[data-action="save"]').click();
    await flush(); await flush();
    expect(store.list('documents')).toEqual([expect.objectContaining({ kind: 'EXPENSE_RECEIPT', paymentMethod: 'CARD' })]);
  });
});

describe('lists', () => {
  it('shows processed received invoices and the expense summary', async () => {
    const doc = await inboxDoc();
    await store.update('documents', doc.id, { status: 'PROCESSED', issueDate: today });
    renderList(root, LISTS.received);
    expect(root.querySelector('h1').textContent).toBe('Prijaté faktúry');
    expect(root.textContent).toContain('Účtovníctvo Pro s.r.o.');
    const receipt = await inboxDoc(read('text/sk-receipt-shop.txt'));
    await store.update('documents', receipt.id, { status: 'PROCESSED', lines: receipt.lines.map(l => ({ ...l, accountingCategory: 'OFFICE' })) });
    root.replaceChildren();
    renderList(root, LISTS.expenses);
    expect(root.querySelector('.expense-summary').textContent).toContain('Kancelárske potreby');
  });

  it('shows the demo received invoices read-only', () => {
    setPref('demo', true);
    renderList(root, LISTS.received);
    expect(root.querySelector('.table-empty').hidden).toBe(true);
  });
});
