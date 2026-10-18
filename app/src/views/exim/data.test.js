// The data side of the export and import screens: demo documents, the
// accountant ZIP with PDFs and summary, marking exported, writing an
// import and a restore through the store, and the encrypted backup file.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeTotals, readZip, buildBackup, serializeBackup, parseBackup } from '@we-invoice/core';
import { Store, memoryAdapter } from '../../store/index.js';
import { company, contacts, documents } from '../../../../tests/fixtures/exports/period.js';
import { demoDocument } from './source.js';
import { buildAccountantZip, markExported, summaryText, localStamp } from './export-run.js';
import { replaceCompanyData } from './store-bulk.js';
import { backupText, readBackup, isEncryptedBackup } from './backup-file.js';
import { parseSources } from './import-read.js';
import { applyImport } from './import-apply.js';
import { buildImportPlan, readCsv, planRestore, SCHEMA_VERSION } from './core-bridge.js';
import { draftInvoice, standardRate } from './tracker-panel.js';

async function storeWith(records = {}) {
  const events = [];
  let tick = 0;
  const store = new Store({ adapter: memoryAdapter(), emit: (name, payload) => events.push({ name, payload }), now: () => new Date(Date.UTC(2026, 9, 18, 9, 0, tick++)).toISOString() });
  await store.open();
  await store.createCompany({ ...company, id: undefined, series: [{ id: 's1', kind: 'INVOICE', mask: 'FV{YYYY}{N:3}', reset: 'YEARLY', counters: {} }] });
  const data = { ...store.data };
  Object.entries(records).forEach(([name, list]) => { data[name] = list; });
  await store.applySynced(data);
  events.length = 0;
  return { store, events };
}

const fakePdf = {
  buildPdf: async (doc) => ({ arrayBuffer: async () => new TextEncoder().encode(`%PDF ${doc.number}`).buffer }),
  pdfFileNameFor: (doc) => `Faktura_${doc.number}.pdf`
};

describe('demo documents', () => {
  it('become documents with one line at their own rate', () => {
    const doc = demoDocument({ id: 'd1', kind: 'INVOICE', number: 'FA20260001', status: 'PAID', issueDate: '2026-09-01', dueDate: '2026-09-15', contactId: 'c', contactName: 'X', currency: 'EUR', totalNet: '100.00', totalVat: '23.00', totalGross: '123.00', paidAmount: '123.00' }, company, [{ id: 'c', name: 'X', ico: '1' }]);
    expect(computeTotals(doc).payable).toBe('123.00');
    expect(doc.buyer.name).toBe('X');
    expect(doc.payments).toHaveLength(1);
  });
});

describe('accountant ZIP', () => {
  it('holds the summary, the PDFs of issued documents and the chosen files', async () => {
    const out = await buildAccountantZip({ company, contacts, documents }, { from: '2026-09-01', to: '2026-09-30', formats: ['pdf', 'csv', 'pohoda'] }, { ...fakePdf, now: new Date('2026-10-01T10:00:00Z') });
    const files = await readZip(out.bytes);
    const names = [...files.keys()];
    expect(names[0]).toMatch(/\.txt$/);
    expect(names).toEqual(expect.arrayContaining(['pdf/Faktura_FA2026001.pdf', 'pdf/Faktura_DB2026001.pdf', 'pohoda.xml']));
    expect(names.filter(n => n.startsWith('pdf/'))).toHaveLength(3);
    expect(out.fileName).toBe('Biela_Hora_s._r._o._2026-09-01_2026-09-30.zip');
    expect(new TextDecoder().decode(files.get(names[0]))).toContain('Biela Hora s. r. o.');
  });

  it('lists a PDF that failed instead of failing the package', async () => {
    const broken = { ...fakePdf, buildPdf: async () => { const e = new Error('x'); e.code = 'PDF_MISSING_FIELDS'; throw e; } };
    const out = await buildAccountantZip({ company, contacts, documents }, { from: '2026-09-01', to: '2026-09-30', formats: ['pdf'] }, broken);
    expect(out.skipped.filter(s => s.format === 'pdf')).toHaveLength(3);
    expect(summaryText({ documents: [], summary: [], skipped: [], warnings: ['UBL_NOT_AVAILABLE'] }, { company, from: '2026-09-01', to: '2026-09-30', now: '2026-10-01T10:00:00Z' })).toContain('\r\n');
  });

  it('stamps the ZIP with the time in Bratislava', () => {
    expect(localStamp(new Date('2026-07-01T22:30:05Z'))).toBe('2026-07-02T00:30:05');
  });
});

describe('writing through the store', () => {
  it('marks documents exported with a lock and an audit entry, announced as a local change', async () => {
    const { store, events } = await storeWith({ documents });
    const count = await markExported(store, documents.slice(0, 2), '2026-10-01T10:00:00.000Z');
    expect(count).toBe(2);
    const doc = store.get('documents', documents[0].id);
    expect(doc).toMatchObject({ exportedAt: '2026-10-01T10:00:00.000Z', lockedAt: '2026-10-01T10:00:00.000Z' });
    expect(store.list('auditLog').map(a => a.action)).toEqual(['EXPORT', 'EXPORT']);
    expect(events.map(e => e.payload && e.payload.source)).toEqual(['sync', 'local']);
  });

  it('refuses to replace data that is read-only or of another company', async () => {
    const { store } = await storeWith();
    await expect(replaceCompanyData(store, { ...store.data, companyId: 'other' })).rejects.toMatchObject({ code: 'NO_COMPANY' });
    store.readOnly = true;
    await expect(replaceCompanyData(store, store.data)).rejects.toMatchObject({ code: 'READ_ONLY' });
  });

  it('imports an iDoklad table, links nothing twice and continues the numbering', async () => {
    const { store } = await storeWith();
    const rows = readCsv(readFileSync(new URL('../../../../tests/fixtures/imports/idoklad-vydane-faktury.csv', import.meta.url), 'utf8'));
    const parsed = parseSources('idoklad', [{ name: 'f.csv', rows }], { company, direction: 'OUT' });
    expect(parsed.tables[0]).toMatchObject({ name: 'f.csv', entity: 'documents' });
    const plan = buildImportPlan(parsed, { contacts: store.list('contacts'), items: [], documents: store.list('documents') });
    const result = await applyImport(store, plan);
    expect(result.added.documents).toHaveLength(3);
    expect(store.list('contacts').map(c => c.name)).toEqual(['Odběratel Praha s.r.o.', 'Malý zákazník']);
    expect(store.company().series[0].counters).toEqual({ 2025: 4 });
    const again = buildImportPlan(parseSources('idoklad', [{ name: 'f.csv', rows }], { company, direction: 'OUT' }), { contacts: store.list('contacts'), items: [], documents: store.list('documents') });
    expect(again.report.added).toEqual({ contacts: 0, items: 0, documents: 0 });
  });

  it('restores a backup over the open company', async () => {
    const { store } = await storeWith({ contacts });
    const backup = parseBackup(serializeBackup(buildBackup({ ...store.data, contacts: contacts.slice(0, 1), documents }, { now: 'T' })));
    const plan = planRestore(store.data, backup, { now: new Date().toISOString(), schemaVersion: SCHEMA_VERSION });
    await replaceCompanyData(store, plan.data);
    expect(store.list('contacts').map(c => c.id)).toEqual(['c-1']);
    expect(store.list('documents')).toHaveLength(documents.length);
  });
});

describe('backup file', () => {
  const data = { schemaVersion: 1, companyId: 'co', updatedAt: 'T', company, contacts, documents };

  it('round-trips without and with a password', async () => {
    const plain = await backupText(data, { now: 'T' });
    expect(isEncryptedBackup(plain)).toBe(false);
    expect((await readBackup(plain)).data.contacts).toHaveLength(3);
    const sealed = await backupText(data, { password: 'heslo-123456', iterations: 1000, now: 'T' });
    expect(isEncryptedBackup(sealed)).toBe(true);
    expect(sealed).not.toContain('Biela Hora');
    expect((await readBackup(sealed, 'heslo-123456')).data.documents).toHaveLength(documents.length);
  });

  it('tells a wrong password, a missing one and a short one apart', async () => {
    const sealed = await backupText(data, { password: 'heslo-123456', iterations: 1000 });
    await expect(readBackup(sealed, 'ine-heslo-1')).rejects.toMatchObject({ code: 'BACKUP_PASSWORD_WRONG' });
    await expect(readBackup(sealed)).rejects.toMatchObject({ code: 'BACKUP_PASSWORD_REQUIRED' });
    await expect(backupText(data, { password: 'kratke' })).rejects.toMatchObject({ code: 'BACKUP_PASSWORD_SHORT' });
  });
});

describe('WE Time Tracker draft', () => {
  it('uses the standard rate for a VAT payer only', () => {
    expect(standardRate({ vatMode: 'PAYER' }, '2026-10-18')).toBe('23');
    expect(standardRate({ vatMode: 'NONPAYER' }, '2026-10-18')).toBeNull();
  });

  it('makes a draft invoice for the chosen contact without the log ids', () => {
    const draft = draftInvoice(company, contacts[0], [{ id: 'l', name: 'Web', qty: '2', unitPrice: '40.00', vatCategory: 'S', vatRate: '23', sourceLogIds: ['a'] }], '2026-10-18');
    expect(draft).toMatchObject({ kind: 'INVOICE', status: 'DRAFT', issueDate: '2026-10-18', contactId: 'c-1', buyer: { name: 'Odberateľ, a. s.' } });
    expect(draft.lines[0].sourceLogIds).toBeUndefined();
    expect(computeTotals(draft).payable).toBe('98.40');
  });
});
