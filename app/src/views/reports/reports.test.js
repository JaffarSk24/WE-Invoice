// The data side of the reports module on a real store over a memory
// adapter: the recycle bin brings tombstones back under their own id and
// empties them for good, the change log records local changes only, the
// demo documents get the stored shape, and search results open the right
// route.
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, memoryAdapter } from '../../store/index.js';
import { emit, on } from '../../events.js';
import { setPref, resetPrefsCache } from '../../prefs.js';
import { restoreRecord, purgeRecord } from './trash-store.js';
import { createAuditRecorder } from './audit-recorder.js';
import { reportData, demoDocument, writableStore } from './data.js';
import { routeFor, documentRoute, search, resetSearchCache } from '../search/engine.js';
import { eurAmounts, salesReport } from '@we-invoice/core';

async function openStore() {
  const store = createStore({ adapter: memoryAdapter(), emitter: emit });
  await store.open();
  await store.createCompany({ name: 'Alfa s. r. o.', legalForm: 'SRO', taxpayerType: 'PO', vatMode: 'PAYER', accountingMode: 'NONE' });
  return store;
}

const invoice = (over = {}) => ({
  kind: 'INVOICE', status: 'ISSUED', number: 'FA2026001', vs: '2026001', currency: 'EUR', issueDate: '2026-10-01', dueDate: '2026-10-15',
  buyer: { name: 'Beta a.s.' }, lines: [], totals: { net: '100.00', vat: '23.00', gross: '123.00', payable: '123.00' }, payments: [], ...over
});

beforeEach(() => {
  localStorage.clear();
  resetPrefsCache();
  resetSearchCache();
});

describe('recycle bin on the store', () => {
  it('restores a deleted contact under its own id and announces it', async () => {
    const store = await openStore();
    const contact = await store.insert('contacts', { kind: 'COMPANY', name: 'Gama' });
    await store.remove('contacts', contact.id);
    expect(store.get('contacts', contact.id)).toBeNull();
    const seen = [];
    const off = on('data:changed', (p) => seen.push(p));
    await restoreRecord(store, 'contacts', contact.id);
    off();
    expect(store.get('contacts', contact.id)).toMatchObject({ name: 'Gama', deleted: false });
    expect(seen).toEqual([{ collection: 'contacts', id: contact.id, source: 'local' }]);
  });

  it('empties a deleted draft for good but keeps a tombstone for sync', async () => {
    const store = await openStore();
    const draft = await store.insert('documents', invoice({ status: 'DRAFT', number: null, buyer: { name: 'Delta' } }));
    await store.remove('documents', draft.id);
    await purgeRecord(store, 'documents', draft.id);
    const bare = store.get('documents', draft.id, { includeDeleted: true });
    expect(bare).toMatchObject({ id: draft.id, deleted: true, lines: [] });
    expect(bare.purgedAt).toBeTruthy();
    expect(bare.buyer).toBeUndefined();
  });

  it('refuses to empty an issued document and to touch a live record', async () => {
    const store = await openStore();
    const issued = await store.insert('documents', invoice());
    await expect(restoreRecord(store, 'documents', issued.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await store.remove('documents', issued.id);
    await expect(purgeRecord(store, 'documents', issued.id)).rejects.toMatchObject({ code: 'TRASH_ARCHIVED' });
  });

  it('keeps a deleted document in the bin when another one has its number now', async () => {
    const store = await openStore();
    const old = await store.insert('documents', invoice({ seriesId: 's1', number: '20260041' }));
    await store.remove('documents', old.id);
    await store.insert('documents', invoice({ seriesId: 's1', number: '20260041' }));
    await expect(restoreRecord(store, 'documents', old.id)).rejects.toMatchObject({ code: 'TRASH_NUMBER_TAKEN', details: { number: '20260041' } });
    expect(store.get('documents', old.id)).toBeNull();
  });

  it('uses restore() of the store when it has one', async () => {
    const calls = [];
    await restoreRecord({ restore: (n, id) => calls.push([n, id]) }, 'items', 'i1');
    expect(calls).toEqual([['items', 'i1']]);
  });
});

describe('change log recorder', () => {
  it('logs local changes of documents with the actor and device, never amounts', async () => {
    const store = await openStore();
    const recorder = createAuditRecorder({ on, device: 'web', demo: () => false });
    const stop = recorder.start();
    emit('sync:status', { status: 'idle', email: 'owner@example.com' });
    const doc = await store.insert('documents', invoice({ status: 'DRAFT', number: null }));
    await recorder.flush();
    await store.update('documents', doc.id, { status: 'ISSUED', number: 'FA2026009', totals: { net: '1.00', vat: '0', gross: '1.00', payable: '1.00' } });
    await recorder.flush();
    await store.remove('documents', doc.id);
    await recorder.flush();
    stop();
    const log = store.list('auditLog');
    expect(log.map(e => e.action)).toEqual(['CREATE', 'ISSUE', 'DELETE']);
    expect(log[0]).toMatchObject({ actor: 'owner@example.com', device: 'web', entity: 'Document', entityId: doc.id });
    expect(log[1].changes).toEqual([{ field: 'number', from: null, to: 'FA2026009' }, { field: 'status', from: 'DRAFT', to: 'ISSUED' }, { field: 'totals' }]);
  });

  it('does not log synced changes, its own entries or other collections', async () => {
    const store = await openStore();
    const recorder = createAuditRecorder({ on, demo: () => false });
    const stop = recorder.start();
    await store.insert('bankTransactions', { date: '2026-10-01', amount: '1' });
    recorder.handle({ collection: 'documents', id: 'x', source: 'sync' });
    await recorder.flush();
    stop();
    expect(store.list('auditLog')).toEqual([]);
  });

  it('writes nothing in demo mode', async () => {
    const store = await openStore();
    const recorder = createAuditRecorder({ on, demo: () => true });
    const stop = recorder.start();
    await store.insert('contacts', { kind: 'PERSON', name: 'Ema' });
    await recorder.flush();
    stop();
    expect(store.list('auditLog')).toEqual([]);
  });
});

describe('report data', () => {
  it('reads the open company and is writable', async () => {
    const store = await openStore();
    await store.insert('documents', invoice());
    const data = reportData();
    expect(data).toMatchObject({ ready: true, demo: false, readOnly: false });
    expect(data.documents).toHaveLength(1);
    expect(writableStore()).toBe(store);
  });

  it('turns demo documents into the stored shape and stays read only', () => {
    const doc = demoDocument({ id: 'd', kind: 'INVOICE', status: 'PARTIALLY_PAID', issueDate: '2026-10-01', dueDate: '2026-10-15', contactName: 'Alfa', currency: 'EUR', totalNet: '100.00', totalVat: '23.00', totalGross: '123.00', paidAmount: '49.20' });
    expect(eurAmounts(doc)).toMatchObject({ net: '100.00', gross: '123.00', paid: '49.20', due: '73.80' });
    expect(doc.buyer.name).toBe('Alfa');
    setPref('demo', true);
    const data = reportData();
    expect(data.demo).toBe(true);
    expect(data.documents.length).toBeGreaterThan(0);
    expect(salesReport(data.documents, {}).total.count).toBeGreaterThan(0);
    expect(writableStore()).toBeNull();
  });
});

describe('search routes', () => {
  it('opens documents on the list of their kind, contacts and items on theirs', () => {
    expect(routeFor({ type: 'document', kind: 'INVOICE', id: 'a' })).toBe('invoices/a');
    expect(routeFor({ type: 'document', kind: 'CREDIT_NOTE', id: 'a' })).toBe('credit-notes/a');
    expect(routeFor({ type: 'received', kind: 'EXPENSE_RECEIPT', id: 'a' })).toBe('expenses/a');
    expect(routeFor({ type: 'received', kind: 'RECEIVED_INVOICE', id: 'a' })).toBe('received/a');
    expect(routeFor({ type: 'contact', id: 'c' })).toBe('contacts/c');
    expect(routeFor({ type: 'item', id: 'i' })).toBe('items/i');
    expect(documentRoute('PROFORMA', 'p')).toBe('proformas/p');
  });

  it('finds a stored invoice by its variable symbol and refreshes after a change', async () => {
    const store = await openStore();
    const doc = await store.insert('documents', invoice());
    expect(search('2026001').results[0]).toMatchObject({ id: doc.id, type: 'document' });
    const other = await store.insert('documents', invoice({ number: 'FA2026002', vs: '2026002' }));
    expect(search('2026002').results[0].id).toBe(other.id);
  });
});
