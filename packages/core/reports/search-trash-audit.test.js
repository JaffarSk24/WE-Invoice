import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import { searchIndex, searchQuery, fold } from './search.js';
import { trashEntries, restoredRecord, purgedRecord, isArchived } from './trash.js';
import { auditEntryFor, auditAction, changedFields, filterAudit } from './audit.js';
import { collectLabels, collectProjects, normalizeLabels } from './labels.js';
import { toCsv, decimalComma } from './csv.js';

const data = {
  documents: [
    { id: 'd1', kind: 'INVOICE', status: 'ISSUED', number: 'FA2026001', vs: '2026001', issueDate: '2026-10-01', currency: 'EUR', buyer: { name: 'Žilinská pekáreň s.r.o.', ico: '12345678' }, totals: { gross: '1234.50', payable: '1234.50' }, tags: ['VIP'] },
    { id: 'd2', kind: 'INVOICE', status: 'ISSUED', number: 'FA2026002', vs: '2026002', issueDate: '2026-10-02', currency: 'EUR', buyer: { name: 'Alfa a.s.' }, totals: { gross: '99.00', payable: '99.00' } },
    { id: 'd3', kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS', number: '240155', vs: '240155', issueDate: '2026-09-30', currency: 'EUR', seller: { name: 'Orange Slovensko' }, totals: { gross: '25.00' } },
    { id: 'd4', kind: 'INVOICE', status: 'DRAFT', deleted: true, number: null, buyer: { name: 'Zmazaný' } }
  ],
  contacts: [{ id: 'c1', kind: 'COMPANY', name: 'Žilinská pekáreň s.r.o.', ico: '12345678', billingAddress: { city: 'Žilina' }, emails: [{ address: 'fakturacia@pekaren.sk' }] }],
  items: [{ id: 'i1', name: 'Chlieb ražný', code: 'CHL-01', price: '2.40' }]
};

describe('search', () => {
  const index = searchIndex(data);

  it('folds case and diacritics', () => {
    expect(fold('Žilinská PEKÁREŇ')).toBe('zilinska pekaren');
  });

  it('skips deleted records', () => {
    expect(index.size).toBe(5);
  });

  it('finds an invoice by its variable symbol first', () => {
    const r = searchQuery(index, '2026001');
    expect(r.results[0]).toMatchObject({ type: 'document', id: 'd1' });
  });

  it('finds by number, by client without diacritics and by amount in any format', () => {
    expect(searchQuery(index, 'fa2026002').results[0].id).toBe('d2');
    expect(searchQuery(index, 'zilinska').results.map(r => r.id)).toEqual(['c1', 'd1']);
    expect(searchQuery(index, '1 234,50').results[0].id).toBe('d1');
    expect(searchQuery(index, '1234.5').results[0].id).toBe('d1');
  });

  it('separates received documents, contacts and items and counts them', () => {
    const r = searchQuery(index, 'orange');
    expect(r.results[0]).toMatchObject({ type: 'received', id: 'd3' });
    expect(searchQuery(index, 'chl-01').results[0]).toMatchObject({ type: 'item', id: 'i1' });
    expect(searchQuery(index, 'pekaren').counts).toEqual({ document: 1, received: 0, contact: 1, item: 0 });
    expect(searchQuery(index, 'pekaren', { types: ['contact'] }).results.map(x => x.id)).toEqual(['c1']);
  });

  it('needs every word and returns nothing for an empty query', () => {
    expect(searchQuery(index, 'pekaren alfa').total).toBe(0);
    expect(searchQuery(index, '  ').results).toEqual([]);
  });

  it('answers 10 000 records quickly', () => {
    const many = { documents: Array.from({ length: 10000 }, (_, i) => ({ ...data.documents[1], id: `m${i}`, number: `FA${100000 + i}`, vs: String(100000 + i) })) };
    const big = searchIndex(many);
    const start = performance.now();
    const r = searchQuery(big, '105432');
    expect(performance.now() - start).toBeLessThan(100);
    expect(r.results[0].id).toBe('m5432');
  });
});

describe('recycle bin', () => {
  const now = '2026-10-18T10:00:00.000Z';
  const bin = {
    documents: [
      { id: 'draft', kind: 'INVOICE', status: 'DRAFT', number: null, deleted: true, updatedAt: '2026-10-10T08:00:00.000Z', createdAt: '2026-10-01T08:00:00.000Z', currency: 'EUR', lines: [{ id: 'l' }], buyer: { name: 'Alfa' } },
      { id: 'issued', kind: 'INVOICE', status: 'ISSUED', number: 'FA1', deleted: true, updatedAt: '2025-01-01T08:00:00.000Z', createdAt: '2025-01-01T08:00:00.000Z', currency: 'EUR', lines: [] },
      { id: 'live', kind: 'INVOICE', status: 'DRAFT', updatedAt: now }
    ],
    contacts: [
      { id: 'old', kind: 'COMPANY', name: 'Stará', deleted: true, updatedAt: '2026-09-01T08:00:00.000Z' },
      { id: 'gone', kind: 'COMPANY', name: '', deleted: true, purgedAt: now, updatedAt: now },
      { id: 'fresh', kind: 'PERSON', name: 'Ján Nový', ico: null, deleted: true, updatedAt: '2026-10-17T08:00:00.000Z', createdAt: '2026-01-01T08:00:00.000Z' }
    ]
  };

  it('lists deleted records within 30 days, issued documents always', () => {
    const entries = trashEntries(bin, { now });
    expect(entries.map(e => e.id)).toEqual(['fresh', 'draft', 'issued']);
    expect(entries.find(e => e.id === 'issued')).toMatchObject({ archived: true, canPurge: false, expiresAt: null });
    expect(entries.find(e => e.id === 'draft')).toMatchObject({ canPurge: true, expiresAt: '2026-11-09T08:00:00.000Z', subtitle: 'Alfa' });
  });

  it('restores a record and removes a draft for good', () => {
    expect(restoredRecord(bin.contacts[2], now)).toMatchObject({ deleted: false, updatedAt: now, name: 'Ján Nový' });
    const bare = purgedRecord('documents', bin.documents[0], now);
    expect(bare).toEqual({ id: 'draft', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: now, deleted: true, purgedAt: now, kind: 'INVOICE', status: 'DRAFT', currency: 'EUR', lines: [] });
    expect(purgedRecord('contacts', bin.contacts[2], now)).toMatchObject({ name: '', kind: 'PERSON', purgedAt: now });
  });

  it('never removes an issued document for good', () => {
    expect(isArchived('documents', bin.documents[1])).toBe(true);
    expect(() => purgedRecord('documents', bin.documents[1], now)).toThrow(expect.objectContaining({ code: 'TRASH_ARCHIVED' }));
    expect(() => restoredRecord(bin.documents[2], now)).toThrow(expect.objectContaining({ code: 'TRASH_NOT_DELETED' }));
  });
});

describe('change log', () => {
  const at = '2026-10-18T10:00:00.000Z';
  const draft = { id: 'd', kind: 'INVOICE', status: 'DRAFT', number: null, totals: { gross: '10.00' }, updatedAt: 'a' };

  it('names the action of a change', () => {
    expect(auditAction(null, draft)).toBe('CREATE');
    expect(auditAction(draft, { ...draft, status: 'ISSUED', number: 'FA1' })).toBe('ISSUE');
    expect(auditAction(draft, { ...draft, deleted: true })).toBe('DELETE');
    expect(auditAction(draft, { ...draft, sendLog: [{ at, channel: 'EMAIL', result: 'OK' }] })).toBe('SEND');
    expect(auditAction(draft, { ...draft, lockedAt: at })).toBe('LOCK');
    expect(auditAction(draft, { ...draft, noteInternal: 'x' })).toBe('UPDATE');
  });

  it('keeps values of plain fields only, never amounts', () => {
    const changes = changedFields(draft, { ...draft, status: 'ISSUED', totals: { gross: '20.00' }, updatedAt: 'b' });
    expect(changes).toEqual([{ field: 'status', from: 'DRAFT', to: 'ISSUED' }, { field: 'totals' }]);
  });

  it('builds a log record and skips changes of the time stamp only', () => {
    const entry = auditEntryFor({ collection: 'documents', before: draft, after: { ...draft, status: 'ISSUED' }, at, device: 'web' });
    expect(entry).toEqual({ at, actor: null, device: 'web', action: 'ISSUE', entity: 'Document', entityId: 'd', changes: [{ field: 'status', from: 'DRAFT', to: 'ISSUED' }], reason: null });
    expect(auditEntryFor({ collection: 'documents', before: draft, after: { ...draft, updatedAt: 'z' }, at })).toBeNull();
    expect(auditEntryFor({ collection: 'auditLog', before: null, after: draft, at })).toBeNull();
    expect(auditEntryFor({ collection: 'contacts', before: { id: 'c', deleted: true }, after: { id: 'c' }, at }).reason).toBe('restore');
  });

  it('filters by local day, action and text, newest first', () => {
    const entries = [
      { id: '1', at: '2026-10-17T22:30:00.000Z', action: 'ISSUE', entity: 'Document', entityId: 'd', changes: [{ field: 'status' }] },
      { id: '2', at: '2026-10-17T10:00:00.000Z', action: 'UPDATE', entity: 'Contact', entityId: 'c', changes: [{ field: 'name' }] },
      { id: '3', at: '2026-10-16T10:00:00.000Z', action: 'CREATE', entity: 'Document', entityId: 'd', changes: [] }
    ];
    // 22:30 UTC on 17 October is already 18 October in Bratislava.
    expect(filterAudit(entries, { from: '2026-10-18' }).map(e => e.id)).toEqual(['1']);
    expect(filterAudit(entries, { entityId: 'd' }).map(e => e.id)).toEqual(['1', '3']);
    expect(filterAudit(entries, { action: 'UPDATE' }).map(e => e.id)).toEqual(['2']);
    expect(filterAudit(entries, { text: 'NAME' }).map(e => e.id)).toEqual(['2']);
  });
});

describe('labels and CSV', () => {
  it('collects labels and projects in use', () => {
    const docs = [{ tags: ['VIP', 'web'], projectRef: 'P1' }, { tags: ['vip '], projectRef: 'P1' }, { tags: ['x'], deleted: true }];
    expect(collectLabels(docs)).toEqual([{ value: 'VIP', count: 2 }, { value: 'web', count: 1 }]);
    expect(collectProjects(docs)).toEqual([{ value: 'P1', count: 2 }]);
    expect(normalizeLabels([' a', 'A', '', 'b'])).toEqual(['a', 'b']);
  });

  it('writes CSV with quoting and a decimal comma', () => {
    const csv = toCsv([{ label: 'Klient', value: r => r.name }, { label: 'Suma', value: r => decimalComma(r.net) }], [{ name: 'Alfa; "beta"', net: '12.50' }]);
    expect(csv).toBe('Klient;Suma\r\n"Alfa; ""beta""";12,50\r\n');
  });
});
