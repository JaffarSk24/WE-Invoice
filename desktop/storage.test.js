import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createStorage } = require('./storage.cjs');
const { parseDocument, liveRecordIds, looksLikeFullReplace } = require('./data-check.cjs');

const doc = (n, extra = {}) => JSON.stringify({
  version: 1,
  invoices: Array.from({ length: n }, (_, i) => ({ id: `inv-${i}`, total: '10.00' })),
  ...extra
});

describe('document checks', () => {
  it('accepts only a JSON object', () => {
    expect(parseDocument('{"a":1}')).toEqual({ a: 1 });
    expect(parseDocument('')).toBe(null);
    expect(parseDocument('null')).toBe(null);
    expect(parseDocument('[1]')).toBe(null);
    expect(parseDocument('{broken')).toBe(null);
    expect(parseDocument(42)).toBe(null);
  });

  it('counts live records with ids, ignoring tombstones', () => {
    const ids = liveRecordIds({ invoices: [{ id: 'a' }, { id: 'b', deleted: true }], nested: { contacts: [{ id: 'c' }] }, settings: { id: 'x' } });
    expect([...ids].sort()).toEqual(['a', 'c']);
  });

  it('spots a document that loses most of its records', () => {
    expect(looksLikeFullReplace(doc(30), doc(3))).toBe(true);
    expect(looksLikeFullReplace(doc(30), doc(29))).toBe(false);
    // Small documents change shape legitimately (first records, demo).
    expect(looksLikeFullReplace(doc(5), doc(0))).toBe(false);
    expect(looksLikeFullReplace('broken', doc(0))).toBe(false);
  });
});

describe('data file storage', () => {
  let dir;
  let now;
  let storage;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-invoice-storage-'));
    now = new Date(2026, 4, 10, 9, 0, 0);
    storage = createStorage(dir, { keep: 2, now: () => now });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('loads nothing before the first save', () => {
    expect(storage.load()).toEqual({ json: null });
  });

  it('saves atomically and loads back', () => {
    expect(storage.save(doc(1))).toEqual({ ok: true });
    expect(storage.load().json).toBe(doc(1));
    expect(fs.existsSync(`${storage.dataFile}.tmp`)).toBe(false);
  });

  it('refuses to overwrite with something that is not a document', () => {
    storage.save(doc(2));
    expect(storage.save('').ok).toBe(false);
    expect(storage.save('null').ok).toBe(false);
    expect(storage.save('{oops').ok).toBe(false);
    expect(storage.load().json).toBe(doc(2));
  });

  it('keeps a corrupt file as a copy instead of replacing it', () => {
    fs.writeFileSync(storage.dataFile, '{"half": ', 'utf8');
    const result = storage.load();
    expect(result.json).toBe(null);
    expect(result.error).toBe('CORRUPT');
    expect(fs.readdirSync(storage.backupsDir)).toEqual(['we-invoice-data-corrupt-2026-05-10_09-00-00.json']);
    expect(fs.readFileSync(storage.dataFile, 'utf8')).toBe('{"half": ');
  });

  it('keeps one daily backup per local day and rotates the oldest', () => {
    storage.save(doc(1));
    storage.save(doc(2));
    // No backup on the first day: there was nothing to copy before the first save.
    now = new Date(2026, 4, 11, 23, 30, 0);
    storage.save(doc(3));
    storage.save(doc(4));
    now = new Date(2026, 4, 12, 8, 0, 0);
    storage.save(doc(5));
    now = new Date(2026, 4, 13, 8, 0, 0);
    storage.save(doc(6));
    const names = fs.readdirSync(storage.backupsDir).sort();
    expect(names).toEqual(['we-invoice-data-2026-05-12.json', 'we-invoice-data-2026-05-13.json']);
    // The copy of a day holds the file as it was before that day's first save.
    expect(fs.readFileSync(path.join(storage.backupsDir, 'we-invoice-data-2026-05-12.json'), 'utf8')).toBe(doc(4));
  });

  it('snapshots the old file before a full replace', () => {
    storage.save(doc(40));
    storage.save(doc(2));
    expect(fs.readdirSync(storage.backupsDir)).toContain('we-invoice-data-before-replace-2026-05-10_09-00-00.json');
  });

  it('keeps tagged copies and refuses unknown tags', () => {
    expect(storage.keepCopy('premerge', doc(1))).toEqual({ ok: true });
    expect(storage.keepCopy('whatever', doc(1)).ok).toBe(false);
    expect(storage.keepCopy('cloud', 'not json').ok).toBe(false);
    expect(fs.readdirSync(storage.backupsDir)).toEqual(['we-invoice-data-premerge-2026-05-10_09-00-00.json']);
  });
});
