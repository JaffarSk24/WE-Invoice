// The import plan (duplicates, links, report), applying it, numbering
// that continues, WE Time Tracker lines and the backup round trip.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { company, contacts, documents } from '../../../tests/fixtures/exports/period.js';
import { buildImportPlan, applyImportPlan, contactKey } from './plan.js';
import { continueSeries } from './series.js';
import { importTimeTracker, timeTrackerClients, readTimeTracker, timeTrackerStatus } from './timetracker.js';
import { parseBackup, planRestore } from './backup.js';
import { buildBackup, serializeBackup } from '../exports/backup.js';
import { createReport } from './report.js';
import { emptyCompanyData } from '../schema/empty.js';

const parsedOf = (over) => ({ contacts: [], items: [], documents: [], report: createReport(), ...over });
const tt = readFileSync(new URL('../../../tests/fixtures/imports/timetracker.json', import.meta.url), 'utf8');

describe('import plan', () => {
  const existing = { contacts, items: [{ id: 'i1', name: 'Pero', code: 'P1' }], documents };

  it('links contacts by IČO, adds new ones once and skips known items and document numbers', () => {
    const parsed = parsedOf({
      contacts: [{ name: 'Odberateľ (iný názov)', ico: '35 757 442' }, { name: 'Nový klient', ico: null, country: 'SK' }, { name: 'Nový klient', country: 'SK' }],
      items: [{ name: 'Pero 2', code: 'p1' }, { name: 'Ceruzka', code: null }],
      documents: [
        { ...documents[0], id: undefined, number: 'FA2026001' },
        { ...documents[0], id: undefined, number: 'FA2025999', buyer: { name: 'Nový klient', address: { country: 'SK' } } },
        { ...documents[3], id: undefined, number: '2026/0815', seller: { ...documents[3].seller, ico: '99999999' } },
        { ...documents[0], id: undefined, number: 'BAD', lines: [{ id: 'x', name: 'x', qty: '1', unitPrice: '1', vatCategory: 'S', vatRate: null }] }
      ]
    });
    const plan = buildImportPlan(parsed, existing);
    expect(plan.contacts.map(c => c.action)).toEqual(['link', 'add']);
    expect(plan.contacts[0].matchId).toBe('c-1');
    expect(plan.items.map(i => i.draft.name)).toEqual(['Ceruzka']);
    expect(plan.documents.map(d => d.draft.number)).toEqual(['FA2025999', '2026/0815']);
    expect(plan.report.added).toEqual({ contacts: 1, items: 1, documents: 2 });
    expect(plan.report.linked.contacts).toBe(1);
    expect(plan.report.skipped).toEqual([
      { entity: 'items', ref: 'p1', reason: 'DUPLICATE_ITEM' },
      { entity: 'documents', ref: 'FA2026001', reason: 'DUPLICATE_NUMBER' },
      { entity: 'documents', ref: 'BAD', reason: 'VAT_RATE_REQUIRED' }
    ]);
  });

  it('adds the records with ids, links documents to their contacts and stores totals', () => {
    const parsed = parsedOf({
      contacts: [{ name: 'Nový klient', country: 'SK', billingAddress: { country: 'SK' } }],
      documents: [{ ...documents[0], id: undefined, number: 'FA2025999', buyer: { name: 'Nový klient', address: { country: 'SK' } } }]
    });
    const plan = buildImportPlan(parsed, { contacts: [], documents: [] });
    let n = 0;
    const data = emptyCompanyData({ company, now: 'T0', schemaVersion: 1 });
    const { data: next, added } = applyImportPlan(data, plan, { now: '2026-10-18T10:00:00.000Z', newId: () => `id-${++n}` });
    expect(added).toEqual({ contacts: ['id-1'], items: [], documents: ['id-2'] });
    const doc = next.documents[0];
    expect(doc).toMatchObject({ id: 'id-2', contactId: 'id-1', createdAt: '2026-10-18T10:00:00.000Z', deleted: false });
    expect(doc.buyer.contactId).toBe('id-1');
    expect(doc.payments[0].id).toBe('id-3');
    expect(doc.totals).toMatchObject({ net: '536.00', vat: '116.80', payable: '652.80' });
    expect(doc.totals.lines).toBeUndefined();
    expect(data.documents).toEqual([]);
  });

  it('keys contacts without an IČO by name and country', () => {
    expect(contactKey({ name: ' Žltý  Kôň ', country: 'SK' })).toBe('name:zlty kon|SK');
    expect(contactKey({ ico: '123456' })).toBe('ico:00123456');
  });
});

describe('numbering after an import', () => {
  it('moves each counter past the highest imported number of its period', () => {
    const series = [
      { id: 's1', kind: 'INVOICE', mask: 'FA{YYYY}{N:4}', reset: 'YEARLY', counters: { 2026: 2 } },
      { id: 's2', kind: 'CREDIT_NOTE', mask: 'DB{YY}/{N}', reset: 'YEARLY', counters: {} }
    ];
    const docs = [
      { kind: 'INVOICE', number: 'FA20260041', issueDate: '2026-03-01' }, { kind: 'INVOICE', number: 'FA20250007', issueDate: '2025-12-01' },
      { kind: 'INVOICE', number: 'X-1' }, { kind: 'CREDIT_NOTE', number: 'DB26/3', issueDate: '2026-02-01' }
    ];
    const { series: next, changed } = continueSeries(series, docs);
    expect(changed).toBe(true);
    expect(next[0].counters).toEqual({ 2026: 42, 2025: 8 });
    expect(next[1].counters).toEqual({ 2026: 4 });
    expect(continueSeries(next, docs).changed).toBe(false);
  });
});

describe('WE Time Tracker', () => {
  it('lists the clients of the file', () => {
    expect(timeTrackerClients(readTimeTracker(tt))).toEqual([{ id: 'client_a', name: null, count: 6 }, { id: 'client_b', name: null, count: 1 }]);
  });

  it('turns unpaid billable hours of a client and month into lines per project and rate', () => {
    const result = importTimeTracker(tt, { clientId: 'client_a', from: '2026-09-01', to: '2026-09-30', groupBy: 'project', vatRate: '23', label: g => g.key });
    expect(result.lines.map(l => [l.name, l.qty, l.unitPrice, l.vatCategory, l.vatRate, l.unit.code])).toEqual([
      ['proj_web', '6.25', '40.00', 'S', '23', 'HUR'],
      ['proj_app', '1.33', '37.50', 'S', '23', 'HUR']
    ]);
    expect(result.logIds).toEqual(['log_1', 'log_2', 'log_3']);
    expect(result.minutes).toBe(455);
    expect(result.amount).toBe('299.88');
  });

  it('groups by task and by day', () => {
    const byTask = importTimeTracker(tt, { clientId: 'client_a', to: '2026-09-30', groupBy: 'task' });
    expect(byTask.lines.map(l => l.name)).toEqual(['Analýza požiadaviek', 'Programovanie', 'Programovanie']);
    expect(byTask.lines[0].vatCategory).toBe('O');
    const byDay = importTimeTracker(tt, { clientId: 'client_a', groupBy: 'day', unpaidOnly: false });
    expect(byDay.lines.map(l => l.name)).toEqual(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-01']);
  });

  it('accepts the full data file and refuses other JSON', () => {
    const full = { timeLogs: JSON.parse(tt), clients: [{ id: 'client_a', name: 'Klient A' }], projects: [{ id: 'proj_web', name: 'Web' }] };
    expect(timeTrackerClients(readTimeTracker(full))[0].name).toBe('Klient A');
    expect(importTimeTracker(full, { clientId: 'client_a', to: '2026-09-30' }).lines[0].name).toBe('Web');
    expect(() => importTimeTracker('{"a":1}')).toThrow(expect.objectContaining({ code: 'IMPORT_FORMAT_UNKNOWN' }));
    expect(() => importTimeTracker('not json')).toThrow(expect.objectContaining({ code: 'IMPORT_FILE_DAMAGED' }));
  });

  it('writes the status file for Time Tracker', () => {
    expect(timeTrackerStatus({ logIds: ['a'], documentNumber: 'FA1', invoicedAt: 'T' })).toEqual({ format: 'we-time-tracker-invoiced', version: 1, invoicedAt: 'T', documentNumber: 'FA1', logIds: ['a'] });
  });
});

describe('backup and restore', () => {
  const root = { ...emptyCompanyData({ company, now: 'T0', schemaVersion: 1 }), contacts, documents };
  const text = serializeBackup(buildBackup(root, { now: '2026-10-18T10:00:00.000Z' }));

  it('round-trips: export, read, restore over empty data gives the same records', () => {
    const backup = parseBackup(text);
    const { data, restored, removed } = planRestore(null, backup, { now: 'N', schemaVersion: 1 });
    expect(restored).toBe(contacts.length + documents.length);
    expect(removed).toBe(0);
    const strip = (list) => list.map(({ updatedAt, ...r }) => r);
    expect(strip(data.documents)).toEqual(strip(documents));
    expect(strip(data.contacts)).toEqual(strip(contacts));
    expect(data.documents.every(d => d.updatedAt === 'N')).toBe(true);
  });

  it('wins over the current data: newer records come back as the backup has them, others become tombstones', () => {
    const current = { ...root, companyId: 'other-id', contacts: [...contacts, { id: 'c-new', name: 'Pridaný neskôr', updatedAt: 'Z' }] };
    const { data, removed, sameCompany } = planRestore(current, parseBackup(text), { now: 'N', schemaVersion: 1 });
    expect(sameCompany).toBe(false);
    expect(data.companyId).toBe('other-id');
    expect(data.company.id).toBe('other-id');
    expect(removed).toBe(1);
    expect(data.contacts.find(c => c.id === 'c-new')).toMatchObject({ deleted: true, updatedAt: 'N' });
  });

  it('refuses a damaged, foreign or newer file before anything is replaced', () => {
    expect(() => parseBackup('{"format":"we-invoice-backup"')).toThrow(expect.objectContaining({ code: 'BACKUP_DAMAGED' }));
    expect(() => parseBackup('{"format":"other"}')).toThrow(expect.objectContaining({ code: 'BACKUP_FORMAT_UNKNOWN' }));
    expect(() => parseBackup(text.replace('"FA2026001"', '"FA2026009"'))).toThrow(expect.objectContaining({ code: 'BACKUP_DAMAGED' }));
    const newer = JSON.parse(text);
    newer.version = 2;
    expect(() => parseBackup(newer)).toThrow(expect.objectContaining({ code: 'BACKUP_VERSION_NEWER' }));
    const future = buildBackup({ ...root, schemaVersion: 9 }, { now: 'T' });
    expect(() => planRestore(null, parseBackup(future), { now: 'N', schemaVersion: 1 })).toThrow(expect.objectContaining({ code: 'BACKUP_SCHEMA_NEWER' }));
  });
});
