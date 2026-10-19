import { describe, it, expect } from 'vitest';
import { vatRecords } from './records.js';
import { buildKv } from './kv.js';
import { buildSv, splitVatId } from './sv.js';
import { buildVatReturn } from './vat-return.js';
import { withoutAdvances, paymentShares, selfAssessedVat, toEur, documentSign } from './amounts.js';
import { closePeriod, openPeriod, canChangeInPeriod, isPeriodClosed, closedPeriodOf, documentTaxPoint } from './closing.js';
import { recordsDigest, filingEntry, filingsOf, filingStatus, suggestedFilingType } from './filings.js';
import { registrationTurnover } from './threshold.js';
import { ossData, ossCsv } from './oss.js';
import { canExport, mergeProblems, problem } from './problems.js';

const company = (over = {}) => ({ id: 'c', name: 'Firma', vatMode: 'PAYER', vatPeriod: 'MONTH', icDph: 'SK2020123457', address: { country: 'SK' }, closedPeriods: [], ...over });
const party = (over = {}) => ({ name: 'Alfa', icDph: 'SK2021234567', address: { country: 'SK' }, ...over });
let n = 0;
const doc = (over = {}) => {
  n += 1;
  return {
    id: `d${n}`, kind: 'INVOICE', status: 'ISSUED', number: `F${n}`, issueDate: '2026-03-10', taxDate: '2026-03-10', currency: 'EUR',
    seller: party({ name: 'Me' }), buyer: party(), payments: [], links: [], updatedAt: '2026-03-10T08:00:00.000Z',
    lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: '100.00', vatRate: '23', vatCategory: 'S' }], ...over
  };
};

describe('amount helpers', () => {
  it('takes advances out of a final invoice, a partial deduction by its share', () => {
    const groups = [{ category: 'S', rate: '23', base: '2000.00', vat: '460.00' }];
    const advance = { groups: [{ category: 'S', rate: '23', base: '1000.00', vat: '230.00' }], gross: '1230.00', amount: null };
    expect(withoutAdvances(groups, [advance])).toEqual([{ category: 'S', rate: '23', base: '1000.00', vat: '230.00' }]);
    expect(withoutAdvances(groups, [{ ...advance, amount: '615.00' }])).toEqual([{ category: 'S', rate: '23', base: '1500.00', vat: '345.00' }]);
    expect(withoutAdvances(groups, [{ ...advance, groups: [{ category: 'S', rate: '23', base: '2000.00', vat: '460.00' }] }])).toEqual([]);
  });

  it('splits groups by payments so that the parts add up', () => {
    const groups = [{ category: 'S', rate: '23', base: '100.00', vat: '23.00' }];
    const payments = [{ id: 'a', date: '2026-02-01', amount: '41.00' }, { id: 'b', date: '2026-03-01', amount: '41.00' }, { id: 'c', date: '2026-03-02', amount: '41.00' }];
    const march = paymentShares(groups, '123.00', payments, (d) => d.startsWith('2026-03'));
    const feb = paymentShares(groups, '123.00', payments, (d) => d.startsWith('2026-02'));
    const bases = [...feb, ...march].map(s => s.groups[0].base);
    expect(bases).toEqual(['33.33', '33.34', '33.33']);
    expect(paymentShares(groups, '0', payments, () => true)).toEqual([]);
    // An overpayment never taxes more than the document.
    expect(paymentShares(groups, '123.00', [{ id: 'x', date: '2026-03-01', amount: '200.00' }], () => true)[0].groups[0].base).toBe('100.00');
  });

  it('self-assesses at the line rate or the standard rate of the date', () => {
    expect(selfAssessedVat('100.00', null, '2026-03-01')).toEqual({ rate: '23', vat: '23.00' });
    expect(selfAssessedVat('100.00', '0', '2024-06-01')).toEqual({ rate: '20', vat: '20.00' });
    expect(selfAssessedVat('100.00', '19', '2026-03-01')).toEqual({ rate: '19', vat: '19.00' });
  });

  it('converts to euros and needs a rate for another currency', () => {
    expect(toEur('2512.50', { currency: 'CZK', fxRate: '25.125' })).toBe('100.00');
    expect(() => toEur('1', { id: 'x', currency: 'CZK' })).toThrow(expect.objectContaining({ code: 'TAX_FX_RATE_MISSING' }));
    expect(documentSign({ kind: 'CREDIT_NOTE' }, [{ base: '10' }])).toBe(-1);
    expect(documentSign({ kind: 'CREDIT_NOTE' }, [{ base: '-10' }])).toBe(1);
  });
});

describe('VAT records', () => {
  it('returns nothing for a non-payer and rejects a bad period', () => {
    expect(vatRecords([doc()], '2026-03', company({ vatMode: 'NONPAYER' })).entries).toEqual([]);
    expect(() => vatRecords([], '2026-3', company())).toThrow(expect.objectContaining({ code: 'TAX_PERIOD_INVALID' }));
  });

  it('skips drafts, cancelled, deleted and non tax documents', () => {
    const docs = [doc({ status: 'DRAFT' }), doc({ status: 'CANCELLED' }), doc({ deleted: true }), doc({ kind: 'PROFORMA' }), doc({ kind: 'QUOTE' })];
    expect(vatRecords(docs, '2026-03', company()).entries).toEqual([]);
  });

  it('reports a missing rate as a problem of the document, not a crash', () => {
    const records = vatRecords([doc({ currency: 'USD', fxRate: null })], '2026-03', company());
    expect(records.problems.map(p => p.code)).toEqual(['TAX_FX_RATE_MISSING']);
  });

  it('flags a deduction period earlier than the receipt', () => {
    const received = doc({ kind: 'RECEIVED_INVOICE', seller: party({ icDph: 'SK2023456798' }), receivedDate: '2026-04-02', vatDeductionPeriod: '2026-03' });
    expect(vatRecords([received], '2026-03', company()).problems.map(p => p.code)).toContain('DEDUCTION_PERIOD_TOO_EARLY');
  });

  it('counts a quarter deduction period of a monthly payer in the last month of the quarter', () => {
    const received = doc({ kind: 'RECEIVED_INVOICE', seller: party({ icDph: 'SK2023456798' }), receivedDate: '2026-01-20', vatDeductionPeriod: '2026-Q1' });
    expect(vatRecords([received], '2026-02', company()).entries).toEqual([]);
    const march = vatRecords([received], '2026-03', company());
    expect(march.entries).toHaveLength(1);
    expect(march.problems.map(p => p.code)).toEqual(['DEDUCTION_PERIOD_KIND']);
  });

  it('does not deduct for a person registered under § 7 and warns when it charges VAT', () => {
    const c = company({ vatMode: 'REGISTERED_7' });
    const records = vatRecords([doc(), doc({ kind: 'RECEIVED_INVOICE', seller: party({ icDph: 'SK2023456798' }), receivedDate: '2026-03-11' })], '2026-03', c);
    expect(records.entries.find(e => e.direction === 'IN').deductible).toBe('0.00');
    expect(records.problems.map(p => p.code)).toContain('REGISTERED_7_CHARGES_VAT');
  });
});

describe('reports', () => {
  it('rejects unknown filing types and periods without a form', () => {
    const records = vatRecords([doc()], '2026-03', company());
    expect(() => buildKv(records, { company: company(), type: 'X' })).toThrow(expect.objectContaining({ code: 'TAX_FILING_TYPE_INVALID' }));
    expect(() => buildSv(records, { company: company(), type: 'X' })).toThrow(expect.objectContaining({ code: 'TAX_FILING_TYPE_INVALID' }));
    expect(() => buildVatReturn(vatRecords([], '2025-06', company()), { company: company() })).toThrow(expect.objectContaining({ code: 'TAX_FORM_NOT_AVAILABLE' }));
  });

  it('marks a dodatočné priznanie without the discovery date and writes its type', () => {
    const records = vatRecords([doc()], '2026-03', company());
    const vr = buildVatReturn(records, { company: company(), type: 'D' });
    expect(vr.problems.map(p => p.code)).toContain('DISCOVERED_DATE_MISSING');
    const ok = buildVatReturn(records, { company: company(), type: 'D', discoveredOn: '2026-05-02' });
    expect(ok.xml).toContain('<ddp>1</ddp>');
    expect(ok.xml).toContain('<datumZisteniaDdp>02.05.2026</datumZisteniaDdp>');
  });

  it('reports a rate the form has no row for', () => {
    const old = doc({ kind: 'CREDIT_NOTE', taxDate: null, lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: '10.00', vatRate: '20', vatCategory: 'S' }] });
    const vr = buildVatReturn(vatRecords([old], '2026-03', company()), { company: company() });
    expect(vr.problems.map(p => p.code)).toContain('RATE_NOT_ON_FORM');
  });

  it('leaves the supplies of a person registered under § 7 out of the VAT return', () => {
    const c = company({ vatMode: 'REGISTERED_7' });
    const records = vatRecords([doc({ lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: '100.00', vatRate: null, vatCategory: 'E' }] })], '2026-03', c);
    expect(buildVatReturn(records, { company: c }).amounts['exempt.base']).toBeUndefined();
  });

  it('reports a rate without a D.2 attribute instead of dropping it', () => {
    const old = doc({ kind: 'CREDIT_NOTE', taxDate: null, buyer: { name: 'P', address: { country: 'SK' } }, lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: '10.00', vatRate: '20', vatCategory: 'S' }] });
    const kv = buildKv(vatRecords([old], '2026-03', company()), { company: company() });
    expect(kv.problems.map(p => p.code)).toContain('RATE_NOT_ON_FORM');
  });

  it('marks the kontrolný výkaz as abolished from the date in legislation', () => {
    const kv = buildKv(vatRecords([], '2030-07', company()), { company: company() });
    expect(kv.problems.map(p => p.code)).toContain('KV_ABOLISHED');
  });

  it('checks VIES results and Slovak buyers in the súhrnný výkaz', () => {
    const k = (buyer) => doc({ buyer, lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: '100.00', vatRate: null, vatCategory: 'K' }] });
    const records = vatRecords([k(party({ icDph: 'DE123456789', address: { country: 'DE' } })), k(party({ icDph: null, address: { country: 'AT' } }))], '2026-03', company());
    const sv = buildSv(records, { company: company(), vies: { DE123456789: 'INVALID' } });
    expect(sv.problems.map(p => p.code).sort()).toEqual(['PARTNER_VAT_ID_MISSING', 'VIES_INVALID']);
    expect(splitVatId('de 123')).toEqual(['DE', '123']);
  });
});

describe('closing periods', () => {
  it('closes and opens a period with audit entries', () => {
    const { patch, audit } = closePeriod(company(), '2026-03', '2026-04-20T10:00:00.000Z');
    expect(patch).toEqual({ closedPeriods: ['2026-03'] });
    expect(audit).toMatchObject({ action: 'PERIOD_CLOSE', entity: 'taxPeriod', entityId: '2026-03' });
    const closed = company(patch);
    expect(() => closePeriod(closed, '2026-03')).toThrow(expect.objectContaining({ code: 'TAX_PERIOD_ALREADY_CLOSED' }));
    expect(() => openPeriod(closed, '2026-03', ' ')).toThrow(expect.objectContaining({ code: 'TAX_PERIOD_OPEN_REASON_REQUIRED' }));
    expect(() => openPeriod(company(), '2026-03', 'x')).toThrow(expect.objectContaining({ code: 'TAX_PERIOD_NOT_CLOSED' }));
    const opened = openPeriod(closed, '2026-03', 'Chyba v doklade');
    expect(opened.patch.closedPeriods).toEqual([]);
    expect(opened.audit).toMatchObject({ action: 'PERIOD_OPEN', reason: 'Chyba v doklade' });
  });

  it('forbids changes of documents in a closed period and moves into it', () => {
    const c = company({ closedPeriods: ['2026-Q1'] });
    expect(isPeriodClosed(c, '2026-02')).toBe(true);
    expect(isPeriodClosed(c, '2026-04')).toBe(false);
    expect(closedPeriodOf(c, '2026-03-31')).toBe('2026-Q1');
    const inside = doc({ taxDate: '2026-03-31' });
    const outside = doc({ taxDate: '2026-04-01' });
    expect(canChangeInPeriod(inside, { ...inside, number: 'X' }, c)).toEqual({ allowed: false, reason: 'TAX_PERIOD_CLOSED', period: '2026-Q1' });
    expect(canChangeInPeriod(outside, { ...outside, taxDate: '2026-03-01' }, c).allowed).toBe(false);
    expect(canChangeInPeriod(outside, { ...outside, number: 'Y' }, c).allowed).toBe(true);
    expect(canChangeInPeriod(null, { ...inside, status: 'DRAFT' }, c).allowed).toBe(true);
    const received = doc({ kind: 'RECEIVED_INVOICE', receivedDate: '2026-04-03', vatDeductionPeriod: '2026-03' });
    expect(documentTaxPoint(received, c)).toBe('2026-03-31');
  });
});

describe('filed reports', () => {
  const records = { entries: [{ docId: 'a' }, { docId: 'b' }, { docId: 'a' }] };
  const docs = [{ id: 'a', updatedAt: '1' }, { id: 'b', updatedAt: '2' }];

  it('digests the documents behind a report', () => {
    const digest = recordsDigest(records, docs);
    expect(digest).toMatch(/^2:[0-9a-f]{8}$/);
    expect(recordsDigest(records, [{ id: 'a', updatedAt: '1' }, { id: 'b', updatedAt: '3' }])).not.toBe(digest);
  });

  it('knows what was filed, what changed after it and what to file next', () => {
    const digest = recordsDigest(records, docs);
    const log = [
      filingEntry({ report: 'kv', period: '2026-03', type: 'R', status: 'DOWNLOADED', digest, at: '2026-04-10T08:00:00.000Z' }),
      filingEntry({ report: 'kv', period: '2026-03', type: 'R', status: 'FILED', digest, at: '2026-04-11T08:00:00.000Z' }),
      filingEntry({ report: 'kv', period: '2026-02', type: 'R', status: 'FILED', digest, at: '2026-03-11T08:00:00.000Z' })
    ];
    expect(filingsOf(log, 'kv', '2026-03').map(f => f.status)).toEqual(['DOWNLOADED', 'FILED']);
    expect(filingStatus(log, 'kv', '2026-03', digest)).toMatchObject({ filed: true, changedSinceFiling: false });
    expect(filingStatus(log, 'kv', '2026-03', 'other').changedSinceFiling).toBe(true);
    expect(filingStatus(log, 'sv', '2026-03', digest).filed).toBe(false);
    expect(suggestedFilingType(log, 'kv', '2026-04', '2026-05-01')).toBe('R');
    expect(suggestedFilingType(log, 'kv', '2026-03', '2026-04-25')).toBe('O');
    expect(suggestedFilingType(log, 'kv', '2026-03', '2026-04-26')).toBe('D');
    expect(suggestedFilingType([filingEntry({ report: 'sv', period: '2026-03', type: 'R', status: 'FILED', digest })], 'sv', '2026-03', '2026-06-01')).toBe('D');
    expect(suggestedFilingType([filingEntry({ report: 'sv', period: '2026-03', type: 'R', status: 'FILED', digest })], 'sv', '2026-03', '2026-04-20')).toBe('O');
  });
});

describe('registration limit', () => {
  const sale = (date, amount, over = {}) => doc({ issueDate: date, taxDate: date, buyer: { name: 'P', address: { country: 'SK' } }, lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: amount, vatRate: null, vatCategory: 'O' }], ...over });

  it('sums the calendar year, the previous year and the last 12 months', () => {
    const docs = [sale('2025-03-01', '10000.00'), sale('2025-11-01', '20000.00'), sale('2026-02-01', '15000.00'), sale('2026-02-02', '999.00', { status: 'DRAFT' })];
    const r = registrationTurnover(docs, '2026-03-01');
    expect(r).toMatchObject({ amount: '50000', yearToDate: '15000.00', previousYear: '30000.00', rolling12: '35000.00', level: 'OK', share: '70.0' });
  });

  it('warns from 80 %, then over the limit and over the immediate limit', () => {
    expect(registrationTurnover([sale('2026-01-10', '40000.00')], '2026-03-01').level).toBe('NEAR');
    expect(registrationTurnover([sale('2025-06-10', '50000.01')], '2026-03-01').level).toBe('OVER');
    expect(registrationTurnover([sale('2026-01-10', '62500.01')], '2026-03-01').level).toBe('IMMEDIATE');
  });

  it('leaves out exempt and foreign supplies and lowers by credit notes', () => {
    const docs = [
      sale('2026-01-10', '1000.00'),
      sale('2026-01-11', '500.00', { kind: 'CREDIT_NOTE' }),
      sale('2026-01-12', '700.00', { lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: '700.00', vatRate: null, vatCategory: 'E' }] }),
      sale('2026-01-13', '900.00', { buyer: { name: 'D', address: { country: 'DE' } } })
    ];
    expect(registrationTurnover(docs, '2026-03-01').yearToDate).toBe('500.00');
  });

  it('counts 12 months back from 29 February', () => {
    expect(registrationTurnover([sale('2027-03-01', '100.00')], '2028-02-29').rolling12).toBe('100.00');
    expect(registrationTurnover([sale('2027-02-28', '100.00')], '2028-02-29').rolling12).toBe('0.00');
  });
});

describe('OSS data and problems', () => {
  it('sums one-stop shop supplies per country and rate', () => {
    const consumer = (country) => ({ name: 'C', address: { country } });
    const docs = [
      doc({ buyer: consumer('DE'), lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: '100.00', vatRate: '19', vatCategory: 'S' }] }),
      doc({ buyer: consumer('DE'), lines: [{ id: 'l', name: 'X', qty: '2', unitPrice: '50.00', vatRate: '19', vatCategory: 'S' }] }),
      doc({ buyer: consumer('AT'), lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: '10.00', vatRate: '20', vatCategory: 'S' }] })
    ];
    const data = ossData(vatRecords(docs, '2026-Q1', company({ oss: true, vatPeriod: 'QUARTER' })));
    expect(data.rows).toEqual([{ country: 'AT', rate: '20', base: '10.00', vat: '2.00' }, { country: 'DE', rate: '19', base: '200.00', vat: '38.00' }]);
    expect(ossCsv(data)).toBe('period;country;rate;base;vat\n2026-Q1;AT;20;10.00;2.00\n2026-Q1;DE;19;200.00;38.00\n');
    expect(ossData(vatRecords([], '2026-03', company())).problems.map(p => p.code)).toEqual(['OSS_QUARTER_ONLY']);
  });

  it('blocks the export only on errors and merges lists without repeats', () => {
    const a = problem('X', { id: '1', number: 'B' }, { severity: 'warning' });
    const b = problem('Y', { id: '2', number: 'A' });
    expect(canExport([a])).toBe(true);
    expect(canExport([a, b])).toBe(false);
    expect(mergeProblems([a, b], [a]).map(p => p.code)).toEqual(['Y', 'X']);
  });
});
