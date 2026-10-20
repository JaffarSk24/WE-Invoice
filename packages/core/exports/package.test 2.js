// ZIP, XLSX, the "exported" mark, the accountant package and the backup:
// each written file is read back with the readers of the import side.
import { describe, it, expect } from 'vitest';
import { company, contacts, documents, period } from '../../../tests/fixtures/exports/period.js';
import { buildZip, crc32 } from './zip.js';
import { buildXlsx } from './xlsx.js';
import { exportState, exportFingerprint, exportedPatch } from './state.js';
import { accountantFiles, safeName, periodSummary } from './accountant.js';
import { buildBackup, serializeBackup } from './backup.js';
import { readZip } from '../imports/zip.js';
import { readXlsx } from '../imports/xlsx.js';
import { NotImplementedError } from '../errors.js';
import { selectDocuments } from './period.js';

const data = { company, contacts, documents };
const text = (bytes) => new TextDecoder().decode(bytes);

describe('ZIP', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips stored and deflated entries with UTF-8 names', async () => {
    const long = 'riadok faktúry\n'.repeat(200);
    const zip = await buildZip([{ name: 'súhrn.txt', data: long }, { name: 'pdf/a.pdf', data: new Uint8Array([37, 80, 68, 70]) }], { time: '2026-10-18T12:30:10' });
    const files = await readZip(zip);
    expect([...files.keys()]).toEqual(['súhrn.txt', 'pdf/a.pdf']);
    expect(text(files.get('súhrn.txt'))).toBe(long);
    expect([...files.get('pdf/a.pdf')]).toEqual([37, 80, 68, 70]);
    expect(zip.length).toBeLessThan(long.length);
  });

  it('refuses a damaged archive instead of returning part of it', async () => {
    const zip = await buildZip([{ name: 'a.txt', data: 'abc', compress: false }], { compress: false });
    const broken = zip.slice();
    broken[30 + 5] ^= 0xff;
    await expect(readZip(broken)).rejects.toMatchObject({ code: 'IMPORT_FILE_DAMAGED' });
    await expect(readZip(new Uint8Array([1, 2, 3]))).rejects.toMatchObject({ code: 'IMPORT_FILE_DAMAGED' });
  });
});

describe('XLSX', () => {
  it('writes sheets that read back with text, numbers and escaped characters', async () => {
    const bytes = await buildXlsx([
      { name: 'Doklady', rows: [['Číslo', 'Suma'], ['FA1', { value: '-12.50', type: 'number' }], ['A & B <c>', '=1+1']] },
      { name: 'Položky/[x]', rows: [['a']] }
    ]);
    const book = await readXlsx(bytes);
    expect(book.sheets).toEqual(['Doklady', 'Položky  x']);
    expect(book.rows).toEqual([['Číslo', 'Suma'], ['FA1', '-12.50'], ['A & B <c>', '=1+1']]);
    expect((await readXlsx(bytes, { sheet: 'Položky  x' })).rows).toEqual([['a']]);
  });
});

describe('exported and changed after export', () => {
  it('is not exported until marked, then exported, then changed after an edit', () => {
    const doc = documents[0];
    expect(exportState(doc)).toBe('NOT_EXPORTED');
    const marked = { ...doc, ...exportedPatch(doc, '2026-10-01T10:00:00.000Z'), updatedAt: '2026-10-01T10:00:00.050Z' };
    expect(marked.lockedAt).toBe('2026-10-01T10:00:00.000Z');
    expect(exportState(marked)).toBe('EXPORTED');
    expect(exportState({ ...marked, sendLog: [{ at: 'x' }], updatedAt: '2026-11-01T00:00:00.000Z' })).toBe('EXPORTED');
    expect(exportState({ ...marked, dueDate: '2026-09-30' })).toBe('CHANGED_AFTER_EXPORT');
  });

  it('keeps an existing lock and falls back to the timestamps without a fingerprint', () => {
    const locked = { ...documents[0], lockedAt: '2026-09-02T00:00:00.000Z' };
    expect(exportedPatch(locked, '2026-10-01T00:00:00.000Z').lockedAt).toBeUndefined();
    expect(exportState({ exportedAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:03.000Z' })).toBe('EXPORTED');
    expect(exportState({ exportedAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z' })).toBe('CHANGED_AFTER_EXPORT');
  });

  it('does not depend on the order of keys', () => {
    const doc = documents[0];
    const reordered = Object.fromEntries(Object.entries(doc).reverse());
    expect(exportFingerprint(reordered)).toBe(exportFingerprint(doc));
  });
});

describe('accountant package', () => {
  it('holds the register, the program files and ISDOC per document', async () => {
    const result = await accountantFiles(data, { ...period, formats: ['csv', 'xlsx', 'pohoda', 'money', 'omega', 'isdoc'], names: { register: 'doklady', lines: 'polozky' } });
    const names = result.files.map(f => f.name);
    expect(names).toEqual(expect.arrayContaining([
      'doklady.csv', 'polozky.csv', 'doklady.xlsx', 'pohoda.xml', 'money-s3.xml', 'omega-issued.txt', 'omega-received.txt',
      'isdoc/FA2026001.isdoc', 'isdoc/2026_0815.isdoc', 'isdoc/BL-77.isdoc'
    ]));
    expect(result.documents).toHaveLength(5);
    const register = result.files.find(f => f.name === 'doklady.csv').data;
    expect(register.split('\r\n')).toHaveLength(7);
    expect(result.skipped.filter(s => s.format === 'money').map(s => s.number)).toEqual(['BL-77']);
  });

  it('adds UBL through the registered builder and says when there is none yet', async () => {
    const mock = (doc) => `<Invoice>${doc.number}</Invoice>`;
    const withUbl = await accountantFiles(data, { ...period, formats: ['ubl'], buildUbl: mock });
    expect(withUbl.files.map(f => f.name)).toEqual(['ubl/FA2026001.xml', 'ubl/FA2026002.xml', 'ubl/DB2026001.xml']);
    const none = await accountantFiles(data, { ...period, formats: ['ubl'], buildUbl: () => { throw new NotImplementedError('buildUbl'); } });
    expect(none.files).toEqual([]);
    expect(none.warnings).toEqual(['UBL_NOT_AVAILABLE']);
  });

  it('sums the period per kind and currency', () => {
    const summary = periodSummary(selectDocuments(documents, period));
    expect(summary.find(s => s.kind === 'INVOICE' && s.currency === 'EUR')).toEqual({ kind: 'INVOICE', currency: 'EUR', count: 1, net: '536.00', vat: '116.80', gross: '652.80' });
  });

  it('makes safe file names from document numbers', () => {
    expect(safeName('FA 2026/001')).toBe('FA_2026_001');
    expect(safeName('Účet č. 5')).toBe('Ucet_c._5');
    expect(safeName('///')).toBe('document');
  });
});

describe('backup', () => {
  it('carries the schema version, counts and a checksum of the data', () => {
    const root = { schemaVersion: 1, companyId: company.id, updatedAt: 'x', company, contacts, documents, items: [] };
    const backup = buildBackup(root, { now: '2026-10-18T10:00:00.000Z' });
    expect(backup).toMatchObject({ format: 'we-invoice-backup', version: 1, schemaVersion: 1, companyId: company.id, counts: { contacts: 3, documents: 7, items: 0 } });
    expect(backup.checksum).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.parse(serializeBackup(backup)).data.documents).toHaveLength(7);
  });
});
