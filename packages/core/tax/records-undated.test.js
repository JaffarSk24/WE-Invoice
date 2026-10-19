// A document without any date cannot be placed in a VAT period. It must
// not vanish from the records in silence: every period reports it as an
// error, so the user dates it before filing.
import { describe, it, expect } from 'vitest';
import { vatRecords } from './records.js';

const company = { id: 'c', name: 'Firma', vatMode: 'PAYER', vatPeriod: 'MONTH', icDph: 'SK2020123457', address: { country: 'SK' }, closedPeriods: [] };
const party = (over = {}) => ({ name: 'Alfa', icDph: 'SK2021234567', address: { country: 'SK' }, ...over });
const line = (over = {}) => ({ id: 'l', name: 'X', qty: '1', unitPrice: '100.00', vatRate: '23', vatCategory: 'S', ...over });
const base = { status: 'ISSUED', currency: 'EUR', payments: [], links: [], lines: [line()], issueDate: null, taxDate: null };

describe('undated documents in the VAT records', () => {
  it('reports an issued invoice without a date', () => {
    const doc = { ...base, id: 'u1', kind: 'INVOICE', number: 'F1', seller: party({ name: 'Me' }), buyer: party() };
    const records = vatRecords([doc], '2026-03', company);
    expect(records.entries).toEqual([]);
    expect(records.problems.map(p => p.code)).toContain('TAX_DATE_MISSING');
  });

  it('reports a received invoice without any date', () => {
    const doc = { ...base, id: 'u2', kind: 'RECEIVED_INVOICE', number: 'P1', receivedDate: null, seller: party(), buyer: party({ name: 'Me', icDph: 'SK2020123457' }) };
    const records = vatRecords([doc], '2026-03', company);
    expect(records.entries).toEqual([]);
    expect(records.problems.map(p => p.code)).toContain('RECEIVED_DATE_MISSING');
  });

  it('reports a self-assessed purchase without a date', () => {
    const doc = {
      ...base, id: 'u3', kind: 'RECEIVED_INVOICE', number: 'P2', receivedDate: null,
      seller: party({ name: 'GmbH', icDph: 'DE123456789', address: { country: 'DE' } }), buyer: party({ name: 'Me', icDph: 'SK2020123457' }),
      lines: [line({ vatCategory: 'AE', vatRate: '0' })]
    };
    const records = vatRecords([doc], '2026-03', company);
    expect(records.entries).toEqual([]);
    expect(records.problems.map(p => p.code)).toContain('TAX_DATE_MISSING');
  });
});
