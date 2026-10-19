// Edge cases of the reports built from the VAT records: the kontrolny vykaz,
// the suhrnny vykaz, the VAT return, the OSS data and the registration
// limit. Each test feeds records with one specific defect and checks that
// the report flags it (or leaves it out) the way the filing rules require.
import { describe, it, expect } from 'vitest';
import { vatRecords } from './records.js';
import { buildKv } from './kv.js';
import { buildSv } from './sv.js';
import { buildVatReturn } from './vat-return.js';
import { ossData } from './oss.js';
import { registrationTurnover } from './threshold.js';

const company = (over = {}) => ({ id: 'c', name: 'Firma', vatMode: 'PAYER', vatPeriod: 'MONTH', icDph: 'SK2020123457', address: { country: 'SK' }, closedPeriods: [], ...over });
const party = (over = {}) => ({ name: 'Alfa', icDph: 'SK2021234567', address: { country: 'SK' }, ...over });
const line = (over = {}) => ({ id: 'l', name: 'X', qty: '1', unitPrice: '100.00', vatRate: '23', vatCategory: 'S', ...over });
let n = 0;
const doc = (over = {}) => {
  n += 1;
  return {
    id: `p${n}`, kind: 'INVOICE', status: 'ISSUED', number: `F${n}`, issueDate: '2026-03-10', taxDate: '2026-03-10', currency: 'EUR',
    seller: party({ name: 'Me' }), buyer: party(), payments: [], links: [], lines: [line()], ...over
  };
};
const codes = (report) => report.problems.map(p => p.code);

describe('kontrolny vykaz: partner and number checks', () => {
  it('reports one problem per document, the first one found', () => {
    // Reverse charge to a Slovak buyer without IC DPH, and no number either:
    // only the missing id is reported for that document.
    const rc = doc({ number: null, buyer: { name: 'B', address: { country: 'SK' } }, lines: [line({ id: 'a', vatRate: null, vatCategory: 'AE' }), line({ id: 'b' })] });
    const kv = buildKv(vatRecords([rc], '2026-03', company()), { company: company() });
    const own = kv.problems.filter(p => p.docId === rc.id).map(p => p.code);
    expect(own).toEqual(['PARTNER_VAT_ID_MISSING']);
  });

  it('requires a number on an issued invoice', () => {
    const invoice = doc({ number: null });
    const kv = buildKv(vatRecords([invoice], '2026-03', company()), { company: company() });
    expect(kv.problems).toEqual([expect.objectContaining({ code: 'DOCUMENT_NUMBER_MISSING', docId: invoice.id, severity: 'error' })]);
    expect(kv.sections.A1).toHaveLength(1);
  });
});

describe('suhrnny vykaz: buyer checks', () => {
  const kLine = line({ vatRate: null, vatCategory: 'K' });

  it('is an error for a company that is not registered for VAT', () => {
    const sv = buildSv(vatRecords([], '2026-03', company({ vatMode: 'NONPAYER' })), { company: company({ vatMode: 'NONPAYER' }) });
    expect(codes(sv)).toEqual(['SV_NOT_REGISTERED']);
    expect(sv.rows).toEqual([]);
  });

  it('leaves out a supply to a Slovak VAT id and reports it', () => {
    const supply = doc({ lines: [kLine] });
    const sv = buildSv(vatRecords([supply], '2026-03', company()), { company: company() });
    expect(sv.rows).toEqual([]);
    expect(sv.problems).toEqual([expect.objectContaining({ code: 'SV_DOMESTIC_BUYER', docId: supply.id, params: { id: 'SK2021234567' } })]);
  });

  it('keeps a row with a malformed VAT id but flags it as invalid', () => {
    const supply = doc({ buyer: party({ icDph: 'DE12', address: { country: 'DE' } }), lines: [kLine] });
    const sv = buildSv(vatRecords([supply], '2026-03', company()), { company: company() });
    expect(sv.rows).toMatchObject([{ vatId: 'DE12', code: '0', value: '100.00' }]);
    expect(codes(sv).sort()).toEqual(['PARTNER_VAT_ID_INVALID', 'VIES_NOT_CHECKED']);
  });

  it('reports a missing buyer VAT id once per document', () => {
    const supply = doc({ buyer: { name: 'D', address: { country: 'DE' } }, lines: [kLine, line({ id: 'b', vatRate: null, vatCategory: 'AE' })] });
    const sv = buildSv(vatRecords([supply], '2026-03', company()), { company: company() });
    expect(sv.problems).toEqual([expect.objectContaining({ code: 'PARTNER_VAT_ID_MISSING', docId: supply.id })]);
  });
});

describe('VAT return: filing type, registration and rates', () => {
  it('rejects an unknown filing type', () => {
    expect(() => buildVatReturn(vatRecords([], '2026-03', company()), { company: company(), type: 'X' }))
      .toThrow(expect.objectContaining({ code: 'TAX_FILING_TYPE_INVALID' }));
  });

  it('is an error for a company that is not registered for VAT', () => {
    const vr = buildVatReturn(vatRecords([], '2026-03', company({ vatMode: 'NONPAYER' })), { company: company({ vatMode: 'NONPAYER' }) });
    expect(codes(vr)).toEqual(['VAT_RETURN_NOT_REGISTERED']);
  });

  it('reports a supply whose VAT group has no rate instead of guessing a row', () => {
    const stored = doc({ totals: { net: '100.00', vat: '23.00', gross: '123.00', breakdown: [{ category: 'S', base: '100.00', vat: '23.00' }] } });
    const vr = buildVatReturn(vatRecords([stored], '2026-03', company()), { company: company() });
    expect(vr.problems).toEqual([expect.objectContaining({ code: 'RATE_NOT_ON_FORM', docId: stored.id, params: { rate: '' } })]);
    expect(vr.amounts['supply.STANDARD.base']).toBeUndefined();
  });

  it('reports a deduction at a rate Slovakia does not have', () => {
    const received = doc({ kind: 'RECEIVED_INVOICE', seller: party({ icDph: 'SK2023456798' }), receivedDate: '2026-03-11', lines: [line({ vatRate: '17' })] });
    const vr = buildVatReturn(vatRecords([received], '2026-03', company()), { company: company() });
    expect(vr.problems).toEqual([expect.objectContaining({ code: 'RATE_NOT_ON_FORM', docId: received.id, params: { rate: '17' } })]);
    expect(Object.keys(vr.amounts).filter(k => k.startsWith('deduction.'))).toEqual([]);
  });
});

describe('OSS data next to other supplies', () => {
  it('sums only one-stop shop supplies and ignores domestic ones', () => {
    const c = company({ oss: true, vatPeriod: 'QUARTER' });
    const docs = [doc(), doc({ buyer: { name: 'C', address: { country: 'DE' } }, lines: [line({ vatRate: '19' })] })];
    const data = ossData(vatRecords(docs, '2026-Q1', c));
    expect(data.rows).toEqual([{ country: 'DE', rate: '19', base: '100.00', vat: '19.00' }]);
    expect(data.problems).toEqual([]);
  });
});

describe('registration limit: documents that do not count', () => {
  const sale = (date, amount, over = {}) => doc({ issueDate: date, taxDate: date, buyer: { name: 'P', address: { country: 'SK' } }, lines: [line({ unitPrice: amount, vatRate: null, vatCategory: 'O' })], ...over });

  it('skips missing documents, advances, received invoices, future and undated sales', () => {
    const docs = [
      null,
      sale('2026-01-10', '1000.00'),
      sale('2026-01-11', '300.00', { kind: 'ADVANCE_TAX_DOC' }),
      sale('2026-01-12', '400.00', { kind: 'RECEIVED_INVOICE' }),
      sale('2026-04-01', '500.00'),
      sale(null, '600.00')
    ];
    const r = registrationTurnover(docs, '2026-03-01');
    expect(r).toMatchObject({ yearToDate: '1000.00', rolling12: '1000.00', previousYear: '0.00', problems: [] });
  });

  it('lists a sale it cannot convert to euros and counts the others', () => {
    const docs = [sale('2026-01-10', '1000.00'), sale('2026-01-11', '900.00', { currency: 'USD', fxRate: null })];
    const r = registrationTurnover(docs, '2026-03-01');
    expect(r.yearToDate).toBe('1000.00');
    expect(r.problems).toEqual(['TAX_FX_RATE_MISSING']);
  });
});
