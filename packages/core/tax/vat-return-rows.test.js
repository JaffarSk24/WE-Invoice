// The VAT return against a form version that lacks a row. The shipped form
// has a row for every amount, so this file removes the intra-EU supplies row
// from it: such an amount must be reported as ROW_NOT_ON_FORM, not dropped.
import { describe, it, expect, vi } from 'vitest';
import { vatRecords } from './records.js';
import { buildVatReturn } from './vat-return.js';

vi.mock('./forms.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    formVersion: (name, date) => {
      const version = original.formVersion(name, date);
      if (name !== 'dph') return version;
      const rows = { ...version.rows };
      delete rows['euGoods.base'];
      return { ...version, rows };
    }
  };
});

const company = { id: 'c', name: 'Firma', vatMode: 'PAYER', vatPeriod: 'MONTH', icDph: 'SK2020123457', address: { country: 'SK' }, closedPeriods: [] };

describe('VAT return rows', () => {
  it('reports an amount the form version has no row for', () => {
    const supply = {
      id: 'v1', kind: 'INVOICE', status: 'ISSUED', number: 'F1', issueDate: '2026-03-10', taxDate: '2026-03-10', currency: 'EUR',
      seller: { name: 'Me', icDph: 'SK2020123457', address: { country: 'SK' } },
      buyer: { name: 'GmbH', icDph: 'DE123456789', address: { country: 'DE' } }, payments: [], links: [],
      lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: '500.00', vatRate: null, vatCategory: 'K' }]
    };
    const vr = buildVatReturn(vatRecords([supply], '2026-03', company), { company });
    expect(vr.amounts['euGoods.base']).toBe('500.00');
    expect(vr.problems).toEqual([expect.objectContaining({ code: 'ROW_NOT_ON_FORM', severity: 'error', params: { key: 'euGoods.base' } })]);
    expect(vr.rows.map(r => r.key)).not.toContain('euGoods.base');
    expect(vr.rows.find(r => r.key === 'exempt.base').amount).toBe('500.00');
  });
});
