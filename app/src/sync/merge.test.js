import { describe, it, expect } from 'vitest';
import { mergeRecords, mergeCompanyData, mergeWorkspace, newer } from './merge.js';
import { canonical, hashString, hashOf } from './hash.js';

const T1 = '2026-10-18T09:00:00.000Z';
const T2 = '2026-10-18T10:00:00.000Z';
const T3 = '2026-10-18T11:00:00.000Z';
const rec = (id, updatedAt, fields = {}) => ({ id, createdAt: T1, updatedAt, ...fields });

function base(extra = {}) {
  return { schemaVersion: 1, companyId: 'c1', updatedAt: T1, company: rec('c1', T1, { name: 'Alfa' }), contacts: [], documents: [], ...extra };
}

describe('hash', () => {
  it('canonical ignores key order', () => {
    expect(canonical({ b: 1, a: [1, { d: 2, c: 3 }] })).toBe(canonical({ a: [1, { c: 3, d: 2 }], b: 1 }));
    expect(hashOf({ a: 1 })).toBe(hashString('{"a":1}'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

describe('merging records', () => {
  it('the newer copy wins and tombstones travel', () => {
    const mine = [rec('a', T2, { name: 'mine' }), rec('b', T1, { name: 'old' }), rec('c', T1)];
    const theirs = [rec('a', T1, { name: 'theirs' }), rec('b', T2, { name: 'new' }), rec('c', T3, { deleted: true })];
    const m = mergeRecords(mine, theirs);
    expect(m.records.map(r => r.name)).toEqual(['mine', 'new', undefined]);
    expect(m.records[2].deleted).toBe(true);
    expect(m.localChanged).toBe(true);
    expect(m.remoteChanged).toBe(true);
  });

  it('is symmetric', () => {
    const mine = [rec('a', T2, { name: 'x' }), rec('only-mine', T1)];
    const theirs = [rec('a', T2, { name: 'y' }), rec('only-theirs', T1)];
    const ab = mergeRecords(mine, theirs).records;
    const ba = mergeRecords(theirs, mine).records;
    const byId = (list) => Object.fromEntries(list.map(r => [r.id, canonical(r)]));
    expect(byId(ab)).toEqual(byId(ba));
    expect(ab.find(r => r.id === 'a').name).toBe(newer(mine[0], theirs[0]).name);
  });

  it('reports nothing changed for equal copies', () => {
    const list = [rec('a', T1, { name: 'same' })];
    const m = mergeRecords(list, [{ name: 'same', updatedAt: T1, createdAt: T1, id: 'a' }]);
    expect(m.localChanged).toBe(false);
    expect(m.remoteChanged).toBe(false);
  });

  it('keeps a record known on one side only', () => {
    const m = mergeRecords([], [rec('z', T1)]);
    expect(m.records).toHaveLength(1);
    expect(m.localChanged).toBe(true);
    expect(m.remoteChanged).toBe(false);
  });
});

describe('merging company data', () => {
  it('merges every collection and the company record', () => {
    const local = base({ contacts: [rec('k1', T1, { name: 'A' })], documents: [rec('d1', T2, { number: '1' })] });
    const remote = base({ company: rec('c1', T2, { name: 'Alfa s. r. o.' }), contacts: [rec('k2', T1, { name: 'B' })], documents: [rec('d1', T1, { number: '0' })], updatedAt: T2 });
    const m = mergeCompanyData(local, remote);
    expect(m.data.company.name).toBe('Alfa s. r. o.');
    expect(m.data.contacts.map(c => c.id)).toEqual(['k1', 'k2']);
    expect(m.data.documents[0].number).toBe('1');
    expect(m.data.updatedAt).toBe(T2);
    expect(m.data.items).toEqual([]);
    expect(m.localChanged).toBe(true);
    expect(m.remoteChanged).toBe(true);
    const back = mergeCompanyData(remote, local);
    expect(canonical({ ...back.data, contacts: back.data.contacts.sort((a, b) => a.id.localeCompare(b.id)) }))
      .toBe(canonical({ ...m.data, contacts: m.data.contacts.sort((a, b) => a.id.localeCompare(b.id)) }));
  });

  it('a deletion on one side beats an older edit on the other', () => {
    const local = base({ contacts: [rec('k1', T2, { name: 'edited' })] });
    const remote = base({ contacts: [rec('k1', T3, { name: 'edited', deleted: true })] });
    expect(mergeCompanyData(local, remote).data.contacts[0].deleted).toBe(true);
    expect(mergeCompanyData(remote, local).data.contacts[0].deleted).toBe(true);
  });
});

describe('merging the workspace', () => {
  const ws = (extra) => ({ schemaVersion: 1, workspaceId: 'w', updatedAt: T1, companies: [], activeCompanyId: null, keys: null, settings: {}, betaToken: null, ...extra });

  it('merges companies and takes settings and keys from the later copy', () => {
    const local = ws({ companies: [rec('c1', T1, { name: 'A' })], activeCompanyId: 'c1', settings: { theme: 'dark' }, keys: { kdf: 'rekeyed', createdAt: T1, passwordChangedAt: T3 } });
    const remote = ws({ companies: [rec('c2', T1, { name: 'B' })], updatedAt: T2, settings: { theme: 'light' }, keys: { kdf: 'first', createdAt: T1, passwordChangedAt: null }, activeCompanyId: 'c2' });
    const m = mergeWorkspace(local, remote);
    expect(m.data.companies.map(c => c.id)).toEqual(['c1', 'c2']);
    expect(m.data.settings).toEqual({ theme: 'light' });
    expect(m.data.keys.kdf).toBe('rekeyed');
    expect(mergeWorkspace(remote, local).data.keys.kdf).toBe('rekeyed');
    expect(m.data.activeCompanyId).toBe('c1');
    expect(m.data.updatedAt).toBe(T2);
    expect(m.localChanged).toBe(true);
    expect(m.remoteChanged).toBe(true);
  });

  it('reports no change for equal copies', () => {
    const a = ws({ companies: [rec('c1', T1, { name: 'A' })] });
    const m = mergeWorkspace(a, { ...a });
    expect(m.localChanged).toBe(false);
    expect(m.remoteChanged).toBe(false);
  });
});
