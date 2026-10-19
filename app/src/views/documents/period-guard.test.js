// A closed VAT period stops the sales editor: an issued document in it is
// not saved, a draft is not issued into it, a draft stays free, and the
// review of received documents refuses the same.
import { describe, it, expect } from 'vitest';
import { blockingPeriod, assertPeriodOpen } from './period-guard.js';
import { newDraft } from '../editor/draft.js';
import { issueDraft, saveDocument } from '../editor/actions.js';
import { COMPANY, CONTACT, memoryStore } from './fixtures.js';

const CLOSED = { ...COMPANY, closedPeriods: ['2026-09'] };
const issued = (taxDate) => ({ id: 'd1', kind: 'INVOICE', status: 'ISSUED', issueDate: taxDate, taxDate });

function filled(draft) {
  return { ...draft, lines: [{ ...draft.lines[0], name: 'Consulting', qty: '10', unitPrice: '50' }] };
}

describe('period guard', () => {
  it('names the closed period a change touches', () => {
    expect(blockingPeriod(issued('2026-09-15'), issued('2026-09-15'), CLOSED)).toBe('2026-09');
    expect(blockingPeriod(null, issued('2026-09-30'), CLOSED)).toBe('2026-09');
    expect(blockingPeriod(issued('2026-09-30'), issued('2026-10-01'), CLOSED)).toBe('2026-09');
    expect(blockingPeriod(issued('2026-10-01'), issued('2026-10-02'), CLOSED)).toBeNull();
    expect(blockingPeriod({ ...issued('2026-09-15'), status: 'DRAFT' }, { ...issued('2026-09-15'), status: 'DRAFT' }, CLOSED)).toBeNull();
    expect(blockingPeriod(issued('2026-09-15'), issued('2026-09-15'), COMPANY)).toBeNull();
  });

  it('throws TAX_PERIOD_CLOSED with the period', () => {
    expect(() => assertPeriodOpen(issued('2026-09-15'), issued('2026-09-15'), CLOSED)).toThrow(expect.objectContaining({ code: 'TAX_PERIOD_CLOSED', details: { period: '2026-09' } }));
    expect(() => assertPeriodOpen(null, issued('2026-10-15'), CLOSED)).not.toThrow();
  });
});

describe('sales editor in a closed period', () => {
  it('does not issue a draft into a closed period and stores nothing', async () => {
    const { store } = await memoryStore({ company: CLOSED });
    const contact = await store.insert('contacts', structuredClone(CONTACT));
    const draft = filled(newDraft({ kind: 'INVOICE', company: store.company(), contact, today: '2026-09-20' }));
    await expect(issueDraft(store, draft, { emit: () => {}, now: '2026-10-18T10:00:00.000Z', today: '2026-10-18' }))
      .rejects.toMatchObject({ code: 'TAX_PERIOD_CLOSED' });
    expect(store.list('documents').filter(d => d.status !== 'DRAFT')).toHaveLength(0);
    expect(store.company().series || []).toHaveLength(0);
  });

  it('keeps drafts free and refuses to change an issued document of a closed period', async () => {
    const { store } = await memoryStore();
    const contact = await store.insert('contacts', structuredClone(CONTACT));
    const draft = filled(newDraft({ kind: 'INVOICE', company: store.company(), contact, today: '2026-09-20' }));
    const doc = await issueDraft(store, draft, { emit: () => {}, now: '2026-09-20T10:00:00.000Z', today: '2026-09-20' });
    await store.updateCompany({ closedPeriods: ['2026-09'] });

    await expect(saveDocument(store, { ...doc, note: 'changed' })).rejects.toMatchObject({ code: 'TAX_PERIOD_CLOSED' });
    await expect(saveDocument(store, { ...doc, taxDate: '2026-10-01' })).rejects.toMatchObject({ code: 'TAX_PERIOD_CLOSED' });
    expect(store.get('documents', doc.id).note).not.toBe('changed');

    const other = filled(newDraft({ kind: 'INVOICE', company: store.company(), contact, today: '2026-09-25' }));
    await expect(saveDocument(store, other)).resolves.toMatchObject({ status: 'DRAFT' });

    await store.updateCompany({ closedPeriods: [] });
    await expect(saveDocument(store, { ...doc, note: 'changed' })).resolves.toMatchObject({ note: 'changed' });
  });
});
