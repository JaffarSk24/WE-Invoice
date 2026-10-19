// Two devices issue the first invoice of a company before they sync: the
// series made on first use is the same on both, so after the merge the
// number taken twice is found and given anew on one document.
import { describe, it, expect } from 'vitest';
import { resolveNumberConflicts } from '../../sync/conflicts.js';
import { newDraft } from '../editor/draft.js';
import { issueDraft } from '../editor/actions.js';
import { resolveSeries, defaultSeriesId } from './series.js';
import { COMPANY, CONTACT, memoryStore } from './fixtures.js';

async function firstInvoiceOn(name) {
  const { store } = await memoryStore();
  const contact = await store.insert('contacts', structuredClone(CONTACT));
  const draft = newDraft({ kind: 'INVOICE', company: store.company(), contact, today: '2026-10-18' });
  const filled = { ...draft, lines: [{ ...draft.lines[0], name, qty: '1', unitPrice: '100' }] };
  await issueDraft(store, filled, { emit: () => {}, now: '2026-10-18T10:00:00.000Z', today: '2026-10-18' });
  return store;
}

describe('series made on first use', () => {
  it('has the same id on every device', () => {
    expect(resolveSeries(COMPANY, 'INVOICE').series.id).toBe(defaultSeriesId('INVOICE'));
    expect(resolveSeries(COMPANY, 'CREDIT_NOTE').series.id).toBe('series-default-CREDIT_NOTE');
  });

  it('lets the merge find the number issued on two devices', async () => {
    const a = await firstInvoiceOn('A');
    const b = await firstInvoiceOn('B');
    const docs = [...a.list('documents'), ...b.list('documents')];
    expect(docs.map(d => d.number)).toEqual(['FA20260001', 'FA20260001']);
    const merged = { company: a.company(), documents: docs };
    const result = resolveNumberConflicts(merged, { now: '2026-10-18T11:00:00.000Z' });
    expect(result.renumbered).toBe(1);
    expect(result.data.documents.map(d => d.number).sort()).toEqual(['FA20260001', 'FA20260002']);
  });
});
