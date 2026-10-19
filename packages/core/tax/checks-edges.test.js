// Edge cases of the checks run before a tax report is exported, of period
// closing and of the small helpers (periods, problem lists, XML writer).
// They make sure each warning appears exactly when the business rule says
// so: closed periods, settled advances, drafts and broken documents.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { vatRecords } from './records.js';
import { exportChecks } from './checks.js';
import { canChangeInPeriod, closedPeriodOf, documentTaxPoint } from './closing.js';
import { monthsOf } from './periods.js';
import { mergeProblems, problem } from './problems.js';
import { el, toXml } from './xml.js';

const company = (over = {}) => ({ id: 'c', name: 'Firma', vatMode: 'PAYER', vatPeriod: 'MONTH', icDph: 'SK2020123457', address: { country: 'SK' }, closedPeriods: [], ...over });
const party = (over = {}) => ({ name: 'Alfa', icDph: 'SK2021234567', address: { country: 'SK' }, ...over });
const line = (over = {}) => ({ id: 'l', name: 'X', qty: '1', unitPrice: '100.00', vatRate: '23', vatCategory: 'S', ...over });
let n = 0;
const doc = (over = {}) => {
  n += 1;
  return {
    id: `k${n}`, kind: 'INVOICE', status: 'ISSUED', number: `F${n}`, issueDate: '2026-03-10', taxDate: '2026-03-10', currency: 'EUR',
    seller: party({ name: 'Me' }), buyer: party(), payments: [], links: [], lines: [line()], ...over
  };
};
const check = (docs, c = company()) => exportChecks(vatRecords(docs, '2026-03', c), docs, c);
const codes = (problems) => problems.map(p => p.code);

afterEach(() => vi.restoreAllMocks());

describe('export checks', () => {
  it('does not check a document that was deleted after the records were built', () => {
    const changed = doc({ exportedAt: '2026-04-01T08:00:00.000Z', updatedAt: '2026-04-02T08:00:00.000Z' });
    const records = vatRecords([changed], '2026-03', company());
    expect(codes(exportChecks(records, [changed], company()))).toEqual(['CHANGED_AFTER_EXPORT']);
    expect(exportChecks(records, [{ ...changed, deleted: true }], company())).toEqual([]);
  });

  it('treats totals that cannot be recomputed as a mismatch', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // The stored totals are fine, so the records use them; a corrupt line
    // makes the recomputation fail.
    const corrupt = doc({
      totals: { net: '100.00', vat: '23.00', gross: '123.00', breakdown: [{ category: 'S', rate: '23', base: '100.00', vat: '23.00' }] },
      lines: [line({ qty: 'abc' })]
    });
    const problems = check([corrupt]);
    expect(problems).toEqual([expect.objectContaining({ code: 'TOTALS_MISMATCH', docId: corrupt.id, severity: 'error' })]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('reports a broken advance link once even when two links are broken', () => {
    const invoice = doc({ links: [{ kind: 'ADVANCE_DEDUCTION', docId: 'gone1' }, { kind: 'ADVANCE_DEDUCTION', docId: 'gone2' }] });
    expect(check([invoice])).toEqual([expect.objectContaining({ code: 'ADVANCE_LINK_BROKEN', docId: invoice.id })]);
  });

  it('counts an advance as settled when the final invoice deducts its proforma', () => {
    const proforma = doc({ kind: 'PROFORMA', number: 'PF1' });
    const advance = doc({ kind: 'ADVANCE_TAX_DOC', links: [{ kind: 'FROM_PROFORMA', docId: proforma.id }] });
    const final = doc({ taxDate: '2026-04-05', issueDate: '2026-04-05', links: [{ kind: 'ADVANCE_DEDUCTION', docId: proforma.id }] });
    expect(codes(check([proforma, advance]))).toEqual(['ADVANCE_NOT_SETTLED']);
    expect(check([proforma, advance, final])).toEqual([]);
  });

  it('warns about drafts in the period only for kinds that carry VAT', () => {
    const draftInvoice = doc({ status: 'DRAFT' });
    const draftProforma = doc({ kind: 'PROFORMA', status: 'DRAFT' });
    const problems = check([draftInvoice, draftProforma]);
    expect(problems).toEqual([expect.objectContaining({ code: 'DRAFT_IN_PERIOD', docId: draftInvoice.id, severity: 'warning' })]);
  });

  it('notes that the period is already closed', () => {
    const problems = check([doc()], company({ closedPeriods: ['2026-Q1'] }));
    expect(problems).toEqual([expect.objectContaining({ code: 'PERIOD_CLOSED', docId: null, severity: 'warning' })]);
  });
});

describe('closing: tax point of a document', () => {
  const c = company({ closedPeriods: ['2026-03'] });

  it('has no tax point for a missing document and no closed period for a missing date', () => {
    expect(documentTaxPoint(null, c)).toBeNull();
    expect(closedPeriodOf(c, null)).toBeNull();
  });

  it('places a received invoice by its receipt date when no valid deduction period is set', () => {
    const received = doc({ kind: 'RECEIVED_INVOICE', seller: party({ icDph: 'SK2023456798' }), issueDate: '2026-02-27', taxDate: '2026-02-27', receivedDate: '2026-03-02' });
    expect(documentTaxPoint(received, c)).toBe('2026-03-02');
    expect(documentTaxPoint({ ...received, vatDeductionPeriod: '2026-3' }, c)).toBe('2026-03-02');
    expect(documentTaxPoint({ ...received, receivedDate: null }, c)).toBe('2026-02-27');
    expect(canChangeInPeriod(received, { ...received, number: 'X' }, c)).toEqual({ allowed: false, reason: 'TAX_PERIOD_CLOSED', period: '2026-03' });
  });
});

describe('small helpers', () => {
  it('lists a month period as its own single month', () => {
    expect(monthsOf('2026-07')).toEqual(['2026-07']);
    expect(monthsOf('2026-Q3')).toEqual(['2026-07', '2026-08', '2026-09']);
  });

  it('skips empty entries when problem lists are merged', () => {
    const a = problem('X', { id: '1', number: 'A' });
    expect(mergeProblems([a, null], [undefined, a])).toEqual([a]);
  });

  it('writes text next to elements on its own indented line, escaped', () => {
    const xml = toXml(el('Poznamka', {}, 'A & B', el('Riadok', { c: '1' })));
    expect(xml).toBe('<?xml version="1.0" encoding="UTF-8"?>\n<Poznamka>\n  A &amp; B\n  <Riadok c="1"/>\n</Poznamka>\n');
  });
});
