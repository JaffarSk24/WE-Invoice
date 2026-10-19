// Edge cases of the VAT records (evidencia DPH) and the helpers it relies on:
// documents with missing dates, partners that do not fit the category,
// foreign VAT and advances at a rate the final invoice does not have.
// These are the rules that decide whether and where a document is counted.
import { describe, it, expect } from 'vitest';
import { vatRecords, isRecordable } from './records.js';
import { withoutAdvances } from './amounts.js';
import { treatmentOf } from './treatment.js';

const company = (over = {}) => ({ id: 'c', name: 'Firma', vatMode: 'PAYER', vatPeriod: 'MONTH', icDph: 'SK2020123457', address: { country: 'SK' }, closedPeriods: [], ...over });
const party = (over = {}) => ({ name: 'Alfa', icDph: 'SK2021234567', address: { country: 'SK' }, ...over });
const line = (over = {}) => ({ id: 'l', name: 'X', qty: '1', unitPrice: '100.00', vatRate: '23', vatCategory: 'S', ...over });
let n = 0;
const doc = (over = {}) => {
  n += 1;
  return {
    id: `r${n}`, kind: 'INVOICE', status: 'ISSUED', number: `F${n}`, issueDate: '2026-03-10', taxDate: '2026-03-10', currency: 'EUR',
    seller: party({ name: 'Me' }), buyer: party(), payments: [], links: [], lines: [line()], ...over
  };
};
const german = party({ name: 'GmbH', icDph: 'DE123456789', address: { country: 'DE' } });
const codes = (records) => records.problems.map(p => p.code);

describe('isRecordable', () => {
  it('never records a missing or deleted document', () => {
    expect(isRecordable(null)).toBe(false);
    expect(isRecordable(undefined)).toBe(false);
    expect(isRecordable(doc({ deleted: true }))).toBe(false);
    expect(isRecordable(doc())).toBe(true);
  });
});

describe('VAT records: category and partner', () => {
  it('reports an intra-EU acquisition from a Slovak supplier instead of recording it', () => {
    const received = doc({ kind: 'RECEIVED_INVOICE', seller: party({ icDph: 'SK2023456798' }), receivedDate: '2026-03-11', lines: [line({ vatRate: null, vatCategory: 'K' })] });
    const records = vatRecords([received], '2026-03', company());
    expect(records.entries).toEqual([]);
    expect(records.problems).toEqual([expect.objectContaining({ code: 'CATEGORY_PARTNER_MISMATCH', docId: received.id, severity: 'error' })]);
  });

  it('records VAT charged by a supplier of another member state as foreign, without deduction', () => {
    const received = doc({ kind: 'RECEIVED_INVOICE', seller: german, receivedDate: '2026-03-11', lines: [line({ vatRate: '19' })] });
    const records = vatRecords([received], '2026-03', company());
    expect(records.entries).toHaveLength(1);
    expect(records.entries[0]).toMatchObject({ treatment: 'FOREIGN', base: '100.00', vat: '19.00', deductible: '0.00' });
    expect(records.problems).toEqual([expect.objectContaining({ code: 'FOREIGN_VAT', severity: 'warning' })]);
    expect(records.totals.deductibleVat).toBe('0.00');
  });

  it('lets a programming error inside a document escape instead of hiding it as a problem', () => {
    // links must be an array; a broken value is a defect, not a tax problem.
    const broken = doc({ links: 5 });
    expect(() => vatRecords([broken], '2026-03', company())).toThrow(TypeError);
  });
});

describe('VAT records: missing dates', () => {
  it('places an intra-EU supply without a delivery date on its issue date and flags it', () => {
    const supply = doc({ buyer: german, taxDate: null, issueDate: '2026-03-20', lines: [line({ vatRate: null, vatCategory: 'K' })] });
    const records = vatRecords([supply], '2026-03', company());
    expect(records.entries).toHaveLength(1);
    expect(records.entries[0]).toMatchObject({ treatment: 'EU_GOODS', date: '2026-03-20', base: '100.00', vat: '0.00' });
    expect(codes(records)).toEqual(['TAX_DATE_MISSING']);
  });

  it('reports a missing tax date once even when the invoice has several rates', () => {
    const invoice = doc({ taxDate: null, lines: [line({ id: 'a' }), line({ id: 'b', vatRate: '19' })] });
    const records = vatRecords([invoice], '2026-03', company());
    expect(records.entries.map(e => e.rate)).toEqual(['23', '19']);
    expect(codes(records)).toEqual(['TAX_DATE_MISSING']);
  });

  it('records nothing for an issued invoice without any date', () => {
    const invoice = doc({ taxDate: null, issueDate: null });
    expect(vatRecords([invoice], '2026-03', company()).entries).toEqual([]);
  });

  it('self-assesses a service from another member state on its issue date when the tax date is missing', () => {
    const received = doc({ kind: 'RECEIVED_INVOICE', seller: german, taxDate: null, issueDate: '2026-03-05', receivedDate: '2026-03-12', lines: [line({ vatRate: null, vatCategory: 'AE' })] });
    const records = vatRecords([received], '2026-03', company());
    expect(records.entries).toHaveLength(1);
    expect(records.entries[0]).toMatchObject({ treatment: 'EU_SERVICES', date: '2026-03-05', rate: '23', vat: '23.00', deductible: '23.00' });
    expect(codes(records)).toEqual(['TAX_DATE_MISSING']);
  });

  it('cannot place a self-assessed service without a tax or issue date', () => {
    const received = doc({ kind: 'RECEIVED_INVOICE', seller: german, taxDate: null, issueDate: null, receivedDate: '2026-03-12', lines: [line({ vatRate: null, vatCategory: 'AE' })] });
    expect(vatRecords([received], '2026-03', company()).entries).toEqual([]);
  });

  it('cannot place a received invoice without any date', () => {
    const received = doc({ kind: 'RECEIVED_INVOICE', seller: party({ icDph: 'SK2023456798' }), taxDate: null, issueDate: null, receivedDate: null });
    expect(vatRecords([received], '2026-03', company()).entries).toEqual([]);
  });
});

describe('advances at another rate', () => {
  it('takes out an advance group the final invoice does not have as a negative group', () => {
    const groups = [{ category: 'S', rate: '23', base: '1000.00', vat: '230.00' }];
    const advance = { groups: [{ category: 'S', rate: '19', base: '100.00', vat: '19.00' }], gross: '119.00', amount: null };
    expect(withoutAdvances(groups, [advance])).toEqual([
      { category: 'S', rate: '23', base: '1000.00', vat: '230.00' },
      { category: 'S', rate: '19', base: '-100.00', vat: '-19.00' }
    ]);
  });
});

describe('treatment of the remaining categories', () => {
  const sk = party();
  it('treats an issued zero rated supply as ZERO', () => {
    expect(treatmentOf({ category: 'Z' }, 'OUT', sk)).toBe('ZERO');
  });

  it('treats received exempt and out of scope supplies as such', () => {
    expect(treatmentOf({ category: 'E' }, 'IN', sk)).toBe('EXEMPT');
    expect(treatmentOf({ category: 'O' }, 'IN', sk)).toBe('OUTSIDE');
    expect(treatmentOf({ category: 'O' }, 'IN', german)).toBe('OUTSIDE');
  });
});
