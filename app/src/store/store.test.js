import { describe, it, expect } from 'vitest';
import { SCHEMA_VERSION, UUID_V7 } from '@we-invoice/core';
import { Store } from './store.js';
import { memoryAdapter, KEYS } from './local.js';
import { parseRoot, newRecord, tombstone, live } from './records.js';

function makeStore(initial = {}, { clock = null } = {}) {
  const events = [];
  let tick = 0;
  const now = clock || (() => new Date(Date.UTC(2026, 9, 18, 9, 0, tick++)).toISOString());
  const adapter = memoryAdapter(initial);
  const store = new Store({ adapter, emit: (name, payload) => events.push({ name, payload }), now });
  return { store, adapter, events };
}

async function opened(initial) {
  const made = makeStore(initial);
  await made.store.open();
  return made;
}

describe('store: workspace and companies', () => {
  it('creates an empty workspace on first start and persists it', async () => {
    const { store, adapter } = await opened();
    expect(store.workspace.schemaVersion).toBe(SCHEMA_VERSION);
    expect(store.workspace.workspaceId).toMatch(UUID_V7);
    expect(store.companies()).toEqual([]);
    expect(store.data).toBeNull();
    expect(JSON.parse(adapter.peek(KEYS.workspace)).workspaceId).toBe(store.workspace.workspaceId);
  });

  it('creates a company with its own data file and makes it active', async () => {
    const { store, adapter, events } = await opened();
    const company = await store.createCompany({ name: 'Alfa s. r. o.', legalForm: 'SRO', taxpayerType: 'PO', vatMode: 'PAYER', accountingMode: 'NONE' });
    expect(company.id).toMatch(UUID_V7);
    expect(company.createdAt).toBe(company.updatedAt);
    expect(store.activeCompanyId()).toBe(company.id);
    expect(store.companies().map(c => c.name)).toEqual(['Alfa s. r. o.']);
    const file = JSON.parse(adapter.peek(KEYS.company(company.id)));
    expect(file.companyId).toBe(company.id);
    expect(file.documents).toEqual([]);
    expect(events.map(e => e.name)).toContain('company:switched');
  });

  it('switches companies and keeps their data apart', async () => {
    const { store, events } = await opened();
    const a = await store.createCompany({ name: 'A' });
    await store.insert('contacts', { kind: 'COMPANY', name: 'Contact of A' });
    const b = await store.createCompany({ name: 'B' });
    expect(store.list('contacts')).toEqual([]);
    await store.insert('contacts', { kind: 'PERSON', name: 'Contact of B' });
    events.length = 0;
    await store.switchCompany(a.id);
    expect(store.list('contacts').map(c => c.name)).toEqual(['Contact of A']);
    expect(store.workspace.activeCompanyId).toBe(a.id);
    expect(events[0].name).toBe('company:switched');
    expect(events[0].payload).toMatchObject({ companyId: a.id, company: { id: a.id, name: 'A' } });
    expect(events[0].payload.companies.map(c => c.name)).toEqual(['A', 'B']);
    await store.switchCompany(b.id);
    expect(store.list('contacts').map(c => c.name)).toEqual(['Contact of B']);
    await expect(store.switchCompany('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('reopens the active company after a restart', async () => {
    const { store, adapter } = await opened();
    const a = await store.createCompany({ name: 'A' });
    await store.insert('items', { name: 'Hour', price: '50.00' });
    const again = new Store({ adapter, emit: () => {} });
    await again.open();
    expect(again.activeCompanyId()).toBe(a.id);
    expect(again.list('items')[0].name).toBe('Hour');
  });

  it('removes a company from the list but keeps its file', async () => {
    const { store, adapter } = await opened();
    const a = await store.createCompany({ name: 'A' });
    await store.removeCompany(a.id);
    expect(store.companies()).toEqual([]);
    expect(store.data).toBeNull();
    expect(adapter.peek(KEYS.company(a.id))).not.toBeNull();
  });

  it('renames the company in the list when the record changes', async () => {
    const { store } = await opened();
    await store.createCompany({ name: 'Old' });
    const updated = await store.updateCompany({ name: 'New' });
    expect(updated.name).toBe('New');
    expect(store.companies()[0].name).toBe('New');
    expect(store.company().updatedAt > store.company().createdAt).toBe(true);
  });
});

describe('store: records', () => {
  it('inserts, updates and tombstones records with UTC timestamps', async () => {
    const { store, events } = await opened();
    await store.createCompany({ name: 'A' });
    events.length = 0;
    const contact = await store.insert('contacts', { kind: 'COMPANY', name: 'Beta' });
    expect(contact.id).toMatch(UUID_V7);
    expect(contact.createdAt).toMatch(/Z$/);
    expect(events[0]).toEqual({ name: 'data:changed', payload: { collection: 'contacts', id: contact.id, source: 'local' } });
    const updated = await store.update('contacts', contact.id, { name: 'Beta a. s.' });
    expect(updated.name).toBe('Beta a. s.');
    expect(updated.createdAt).toBe(contact.createdAt);
    expect(updated.updatedAt > contact.updatedAt).toBe(true);
    const removed = await store.remove('contacts', contact.id);
    expect(removed.deleted).toBe(true);
    expect(store.list('contacts')).toEqual([]);
    expect(store.list('contacts', { includeDeleted: true })).toHaveLength(1);
    expect(store.get('contacts', contact.id)).toBeNull();
    expect(store.get('contacts', contact.id, { includeDeleted: true }).deleted).toBe(true);
    await expect(store.update('contacts', contact.id, { name: 'x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('refuses unknown collections and work without a company', async () => {
    const { store } = await opened();
    await expect(store.insert('contacts', { name: 'x' })).rejects.toMatchObject({ code: 'NO_COMPANY' });
    await store.createCompany({ name: 'A' });
    await expect(store.insert('nothing', { name: 'x' })).rejects.toMatchObject({ code: 'UNKNOWN_COLLECTION' });
    expect(() => store.list('nothing')).toThrow();
  });

  it('keeps settings in the workspace', async () => {
    const { store, adapter } = await opened();
    await store.updateSettings({ language: 'sk' });
    expect(JSON.parse(adapter.peek(KEYS.workspace)).settings).toEqual({ language: 'sk' });
  });
});

describe('store: safety', () => {
  it('never overwrites a damaged workspace', async () => {
    const { store, adapter } = await opened({ [KEYS.workspace]: '{not json' });
    expect(store.readOnly).toBe(true);
    expect(store.damaged.has(KEYS.workspace)).toBe(true);
    expect(adapter.peek(KEYS.workspace)).toBe('{not json');
    await expect(store.createCompany({ name: 'A' })).rejects.toMatchObject({ code: 'READ_ONLY' });
    expect(adapter.peek(KEYS.workspace)).toBe('{not json');
  });

  it('never overwrites a damaged company file', async () => {
    const { store, adapter } = await opened();
    const a = await store.createCompany({ name: 'A' });
    await adapter.put(KEYS.company(a.id), '{"companyId": 1}');
    const again = new Store({ adapter, emit: () => {} });
    await again.open();
    expect(again.data).toBeNull();
    expect(again.readOnly).toBe(true);
    expect(adapter.peek(KEYS.company(a.id))).toBe('{"companyId": 1}');
  });

  it('opens a newer schema read-only', async () => {
    const { store, adapter } = await opened();
    const a = await store.createCompany({ name: 'A' });
    const file = JSON.parse(adapter.peek(KEYS.company(a.id)));
    await adapter.put(KEYS.company(a.id), JSON.stringify({ ...file, schemaVersion: SCHEMA_VERSION + 1 }));
    const again = new Store({ adapter, emit: () => {} });
    await again.open();
    expect(again.readOnly).toBe(true);
    expect(again.data.schemaVersion).toBe(SCHEMA_VERSION + 1);
    await expect(again.insert('contacts', { name: 'x' })).rejects.toMatchObject({ code: 'READ_ONLY' });
  });

  it('applies synced roots and announces them as sync', async () => {
    const { store, events } = await opened();
    const a = await store.createCompany({ name: 'A' });
    events.length = 0;
    const synced = { ...store.data, contacts: [newRecord({ name: 'From cloud' })] };
    await store.applySynced(synced);
    expect(store.list('contacts')[0].name).toBe('From cloud');
    expect(events[0].payload.source).toBe('sync');
    await expect(store.applySynced({ ...synced, companyId: 'other' })).rejects.toMatchObject({ code: 'NO_COMPANY' });
    const ws = { ...store.workspace, companies: [...store.workspace.companies, { id: 'c2', name: 'Other', updatedAt: 'x' }], activeCompanyId: 'c2' };
    await store.applySyncedWorkspace(ws);
    expect(store.companies().map(c => c.id)).toEqual([a.id, 'c2']);
    expect(store.workspace.activeCompanyId).toBe(a.id);
  });
});

describe('records helpers', () => {
  it('parses roots strictly', () => {
    expect(parseRoot('[]', 'workspace').error).toBeTruthy();
    expect(parseRoot('{"schemaVersion":1,"workspaceId":"w","companies":[]}', 'workspace').data.settings).toEqual({});
    expect(parseRoot('{"schemaVersion":1,"companyId":"c","company":{},"contacts":{}}', 'company').error).toBeTruthy();
    expect(parseRoot('{"schemaVersion":1,"companyId":"c","company":{}}', 'company').data.documents).toEqual([]);
  });

  it('tombstones and filters', () => {
    const r = newRecord({ name: 'x' }, '2026-01-01T00:00:00.000Z');
    const dead = tombstone(r, '2026-01-02T00:00:00.000Z');
    expect(dead.deleted).toBe(true);
    expect(live([r, dead])).toEqual([r]);
  });
});
