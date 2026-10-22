// Numbering by 03-features.md § 3.5 AC: mask tokens, yearly and monthly
// reset on the boundary, taken numbers, variable symbol from a number with
// letters, conflicts after a merge.
import { describe, it, expect } from 'vitest';
import { formatNumber, nextNumber, vsFromNumber, findNumberConflicts, counterKey, releaseNumber } from './index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const series = (over = {}) => ({ id: 's1', kind: 'INVOICE', mask: 'FA{YYYY}{N:4}', vsMask: null, reset: 'YEARLY', counters: {}, ...over });

describe('formatNumber', () => {
  it('fills every token', () => {
    expect(formatNumber('FA{YYYY}{N:4}', { date: '2026-10-18', counter: 1 })).toBe('FA20260001');
    expect(formatNumber('{YY}{MM}{N:3}', { date: '2026-01-05', counter: 12 })).toBe('2601012');
    expect(formatNumber('INV-{N}', { date: '2026-10-18', counter: 7 })).toBe('INV-7');
    expect(formatNumber('{N:2}/{YYYY}-A', { date: '2026-10-18', counter: 3 })).toBe('03/2026-A');
    expect(formatNumber('{N:4}', { date: '2026-10-18', counter: 123456 })).toBe('123456');
    expect(formatNumber('{N:10}', { date: '2026-10-18', counter: 1 })).toBe('0000000001');
  });

  it('rejects a mask without a counter, a bad counter and a bad date', () => {
    expect(code(() => formatNumber('FA{YYYY}', { date: '2026-10-18', counter: 1 }))).toBe('SERIES_MASK_INVALID');
    expect(code(() => formatNumber(null, { date: '2026-10-18', counter: 1 }))).toBe('SERIES_MASK_INVALID');
    expect(code(() => formatNumber('{N}', { date: '2026-10-18', counter: 0 }))).toBe('SERIES_COUNTER_INVALID');
    expect(code(() => formatNumber('{N}', { date: '2026-10-18', counter: 1.5 }))).toBe('SERIES_COUNTER_INVALID');
    expect(code(() => formatNumber('{N}', { counter: 1 }))).toBe('DATE_INVALID');
    expect(code(() => formatNumber('{N}', { date: '2026-13-01', counter: 1 }))).toBe('DATE_INVALID');
  });
});

describe('counterKey', () => {
  it('depends on the reset', () => {
    expect(counterKey(series({ reset: 'YEARLY' }), '2026-10-18')).toBe('2026');
    expect(counterKey(series({ reset: 'MONTHLY' }), '2026-10-18')).toBe('2026-10');
    expect(counterKey(series({ reset: 'NEVER' }), '2026-10-18')).toBe('all');
    expect(code(() => counterKey(series({ reset: 'WEEKLY' }), '2026-10-18'))).toBe('SERIES_RESET_INVALID');
  });
});

describe('nextNumber', () => {
  it('starts a new series at 1 and reports what to store', () => {
    expect(nextNumber(series(), { date: '2026-10-18' })).toEqual({ number: 'FA20260001', vs: '20260001', counterKey: '2026', nextCounter: 2 });
  });

  it('continues the stored counter of the period', () => {
    const s = series({ counters: { 2026: 42 } });
    expect(nextNumber(s, { date: '2026-12-31' }).number).toBe('FA20260042');
    expect(s.counters).toEqual({ 2026: 42 });
  });

  it('resets on the year boundary', () => {
    const s = series({ counters: { 2026: 42 } });
    expect(nextNumber(s, { date: '2026-12-31' })).toMatchObject({ number: 'FA20260042', counterKey: '2026', nextCounter: 43 });
    expect(nextNumber(s, { date: '2027-01-01' })).toMatchObject({ number: 'FA20270001', counterKey: '2027', nextCounter: 2 });
  });

  it('resets on the month boundary', () => {
    const s = series({ mask: '{YYYY}{MM}{N:3}', reset: 'MONTHLY', counters: { '2026-10': 9 } });
    expect(nextNumber(s, { date: '2026-10-31' }).number).toBe('202610009');
    expect(nextNumber(s, { date: '2026-11-01' })).toMatchObject({ number: '202611001', counterKey: '2026-11' });
  });

  it('never resets with NEVER', () => {
    const s = series({ mask: 'Q{N}', reset: 'NEVER', counters: { all: 100 } });
    expect(nextNumber(s, { date: '2030-05-05' })).toMatchObject({ number: 'Q100', vs: '100', counterKey: 'all', nextCounter: 101 });
  });

  it('skips numbers already taken', () => {
    const s = series({ counters: { 2026: 1 } });
    const taken = ['FA20260001', 'FA20260002', 'FA20260004'];
    expect(nextNumber(s, { date: '2026-10-18', taken })).toMatchObject({ number: 'FA20260003', nextCounter: 4 });
    expect(nextNumber(s, { date: '2026-10-18', taken: new Set(taken) }).number).toBe('FA20260003');
  });

  it('tolerates a broken stored counter', () => {
    expect(nextNumber(series({ counters: { 2026: 0 } }), { date: '2026-10-18' }).number).toBe('FA20260001');
    expect(nextNumber(series({ counters: null }), { date: '2026-10-18' }).number).toBe('FA20260001');
  });

  it('builds the variable symbol from its own mask when given', () => {
    const s = series({ mask: 'FA-{YYYY}/{N:4}', vsMask: '{YY}{N:6}', counters: { 2026: 15 } });
    expect(nextNumber(s, { date: '2026-10-18' })).toMatchObject({ number: 'FA-2026/0015', vs: '26000015' });
  });
});

describe('vsFromNumber', () => {
  it('keeps digits only, at most the last ten', () => {
    expect(vsFromNumber('FA20260001')).toBe('20260001');
    expect(vsFromNumber('FA-2026/0015-X')).toBe('20260015');
    expect(vsFromNumber('ABC')).toBe('');
    expect(vsFromNumber('')).toBe('');
    expect(vsFromNumber(null)).toBe('');
    expect(vsFromNumber('202610000000123')).toBe('0000000123');
    expect(vsFromNumber('1234567890')).toBe('1234567890');
  });
});

describe('findNumberConflicts', () => {
  const list = [series({ counters: { 2026: 4 } })];
  const doc = (id, number, over = {}) => ({ id, seriesId: 's1', number, issueDate: '2026-10-18', createdAt: `2026-10-18T10:00:0${id.slice(-1)}.000Z`, ...over });

  it('is empty without duplicates', () => {
    expect(findNumberConflicts([doc('d1', 'FA20260001'), doc('d2', 'FA20260002')], list)).toEqual([]);
    expect(findNumberConflicts([], list)).toEqual([]);
    expect(findNumberConflicts(undefined, undefined)).toEqual([]);
  });

  it('keeps the document created first and renumbers the other', () => {
    const docs = [doc('d2', 'FA20260003'), doc('d1', 'FA20260003')];
    expect(findNumberConflicts(docs, list)).toEqual([{ docId: 'd2', number: 'FA20260003', proposed: 'FA20260004', locked: false }]);
  });

  it('keeps a locked document even when it was created later', () => {
    const docs = [doc('d1', 'FA20260003'), doc('d2', 'FA20260003', { lockedAt: '2026-10-18T12:00:00.000Z' })];
    expect(findNumberConflicts(docs, list)).toEqual([{ docId: 'd1', number: 'FA20260003', proposed: 'FA20260004', locked: false }]);
  });

  it('proposes distinct free numbers to several duplicates and skips taken ones', () => {
    const docs = [doc('d1', 'FA20260003'), doc('d2', 'FA20260003'), doc('d3', 'FA20260003'), doc('d4', 'FA20260004')];
    expect(findNumberConflicts(docs, list).map(c => [c.docId, c.proposed])).toEqual([['d2', 'FA20260005'], ['d3', 'FA20260006']]);
  });

  it('never renumbers a locked duplicate of a locked number', () => {
    const docs = [doc('d1', 'FA20260003', { lockedAt: '2026-10-18T12:00:00.000Z' }), doc('d2', 'FA20260003', { lockedAt: '2026-10-18T13:00:00.000Z' })];
    expect(findNumberConflicts(docs, list)).toEqual([{ docId: 'd2', number: 'FA20260003', proposed: null, locked: true }]);
  });

  it('numbers from the document date, not the current year', () => {
    const docs = [doc('d1', 'FA20250009', { issueDate: '2025-12-31' }), doc('d2', 'FA20250009', { issueDate: '2025-12-31' })];
    expect(findNumberConflicts(docs, [series({ counters: { 2025: 10, 2026: 4 } })])[0].proposed).toBe('FA20250010');
  });

  it('cannot propose without a series or an issue date, and ignores deleted and unnumbered documents', () => {
    expect(findNumberConflicts([doc('d1', 'X1', { seriesId: 'gone' }), doc('d2', 'X1', { seriesId: 'gone' })], list)).toEqual([{ docId: 'd2', number: 'X1', proposed: null, locked: false }]);
    expect(findNumberConflicts([doc('d1', 'FA20260003'), doc('d2', 'FA20260003', { issueDate: null })], list)[0].proposed).toBeNull();
    expect(findNumberConflicts([doc('d1', 'FA20260003'), doc('d2', 'FA20260003', { deleted: true })], list)).toEqual([]);
    expect(findNumberConflicts([doc('d1', null), doc('d2', null), doc('d3', 'A', { seriesId: null }), doc('d4', 'A', { seriesId: null })], list)).toEqual([]);
  });

  it('orders by id when creation times are equal or missing', () => {
    const docs = [{ id: 'b', seriesId: 's1', number: 'N1', issueDate: '2026-10-18' }, { id: 'a', seriesId: 's1', number: 'N1', issueDate: '2026-10-18' }];
    expect(findNumberConflicts(docs, list)[0].docId).toBe('b');
  });
});

describe('releaseNumber', () => {
  const series = { id: 's1', mask: '{YYYY}{N:4}', reset: 'YEARLY', counters: { 2026: 42 } };
  const docOf = (id, n, extra = {}) => ({ id, seriesId: 's1', number: `2026${String(n).padStart(4, '0')}`, issueDate: '2026-10-22', ...extra });

  it('steps the counter back when the last number is deleted', () => {
    const last = docOf('d41', 41);
    const next = releaseNumber(series, last, [docOf('d40', 40), last]);
    expect(next.counters['2026']).toBe(41);
    expect(nextNumber(next, { date: '2026-10-23', taken: ['20260040'] }).number).toBe('20260041');
  });

  it('keeps the counter when a number in the middle is deleted', () => {
    expect(releaseNumber(series, docOf('d30', 30), [docOf('d30', 30), docOf('d41', 41)])).toBeNull();
  });

  it('steps back over numbers deleted earlier, but not below a number never used', () => {
    const docs = [docOf('d39', 39), docOf('d40', 40, { deleted: true }), docOf('d41', 41)];
    expect(releaseNumber(series, docs[2], docs).counters['2026']).toBe(40);
    const continued = { ...series, counters: { 2026: 42 } };
    expect(releaseNumber(continued, docOf('d41', 41), [docOf('d41', 41)]).counters['2026']).toBe(41);
  });

  it('does nothing without a number, a date or a counter', () => {
    expect(releaseNumber(series, { id: 'x', seriesId: 's1', number: null, issueDate: '2026-10-22' }, [])).toBeNull();
    expect(releaseNumber({ ...series, counters: {} }, docOf('d1', 1), [])).toBeNull();
  });
});
