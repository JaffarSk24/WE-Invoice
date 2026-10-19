// A received document and closed VAT periods: confirming it from the Inbox
// into a closed period is refused (nothing is stored, no supplier card is
// made), another deduction period lets it through, and once its period is
// closed it is not changed any more.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createStore, memoryAdapter } from '../../store/index.js';
import { intakeFile } from './intake.js';
import { valuesOf } from './review-values.js';
import { saveDocument } from './review-actions.js';

const dir = new URL('../../../../tests/fixtures/inbox/', import.meta.url);
const read = (p) => readFileSync(new URL(p, dir), 'utf8');
const { company } = JSON.parse(read('cases.json'));
const today = '2026-10-18';
const fileOf = (name, text) => ({ name, type: 'application/pdf', size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer });
const textReader = (text) => async () => ({ kind: 'PDF', found: { xml: [], qr: [], text, ocrText: '' }, pages: [[]], canvases: [] });

let store;
beforeEach(async () => {
  store = createStore({ adapter: memoryAdapter(), emitter: () => {} });
  await store.open();
  await store.createCompany({ ...company, vatMode: 'PAYER', closedPeriods: ['2026-10'] });
});

describe('received documents in a closed period', () => {
  it('refuses the closed period and accepts an open deduction period', async () => {
    const { doc } = await intakeFile(fileOf('fa.pdf', 'x'), { store, today, readFile: textReader(read('text/sk-invoice-simple.txt')) });
    const values = { ...valuesOf(doc), category: 'SERVICES', paymentMethod: 'TRANSFER', vatDeductionPeriod: '2026-10' };
    await expect(saveDocument(store, doc, values, { today })).rejects.toMatchObject({ code: 'TAX_PERIOD_CLOSED', details: { period: '2026-10' } });
    expect(store.get('documents', doc.id).status).toBe('TO_PROCESS');
    expect(store.list('contacts')).toHaveLength(0);

    const saved = await saveDocument(store, doc, { ...values, vatDeductionPeriod: '2026-11' }, { today });
    expect(saved.vatDeductionPeriod).toBe('2026-11');

    await store.updateCompany({ closedPeriods: ['2026-10', '2026-11'] });
    await expect(saveDocument(store, saved, { ...valuesOf(saved), note: 'later' }, { today })).rejects.toMatchObject({ code: 'TAX_PERIOD_CLOSED', details: { period: '2026-11' } });
  });
});
