// Number conflicts after a merge: the sync side of findNumberConflicts.
import { describe, it, expect } from 'vitest';
import { resolveNumberConflicts } from './conflicts.js';

describe('number conflicts helper', () => {
  const data = { companyId: 'c', company: { series: [] }, documents: [{ id: 'd1', number: 'FA1', seriesId: 's', updatedAt: 'x' }, { id: 'd2', number: 'FA1', seriesId: 's', lockedAt: 'y' }] };

  it('uses the core function: the unlocked duplicate gets the next free number, the locked one keeps its number', () => {
    const withSeries = { ...data, documents: data.documents.map(d => ({ ...d, issueDate: '2026-10-18' })), company: { series: [{ id: 's', kind: 'INVOICE', mask: 'FA{N}', reset: 'NEVER', counters: {} }] } };
    const result = resolveNumberConflicts(withSeries, { now: 'T' });
    expect(result.conflicts.length).toBeGreaterThan(0);
    const unlocked = result.data.documents.find(d => d.id === 'd1');
    const locked = result.data.documents.find(d => d.id === 'd2');
    expect(locked.number).toBe('FA1');
    expect(unlocked.number).not.toBe('FA1');
    expect(result.renumbered).toBe(1);
  });

  it('renumbers unlocked documents and leaves locked ones with a warning', () => {
    const finder = () => [{ docId: 'd1', number: 'FA1', proposed: 'FA2', locked: false }, { docId: 'd2', number: 'FA1', proposed: null, locked: true }];
    const result = resolveNumberConflicts(data, { finder, vs: (n) => n.replace(/\D/g, ''), now: 'T' });
    expect(result.renumbered).toBe(1);
    expect(result.data.documents[0]).toMatchObject({ number: 'FA2', vs: '2', updatedAt: 'T' });
    expect(result.data.documents[1].number).toBe('FA1');
    expect(result.conflicts).toHaveLength(2);
  });
});
