// Conversions between kinds and issuing a draft.
import { describe, it, expect } from 'vitest';
import { convertDocument, conversionTargets, issueDocument, companySnapshot, contactSnapshot } from './index.js';
import { UUID_V7 } from '../ids/uuid.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const NOW = '2026-10-18T10:00:00.000Z';
const company = (over = {}) => ({
  name: 'Firma s. r. o.', legalForm: 'SRO', taxpayerType: 'PO', ico: '36835587', dic: '2020123457', icDph: 'SK2020123457', vatMode: 'PAYER',
  registerEntry: 'OR OS Bratislava I', address: { street: 'Hlavna 1', city: 'Bratislava', zip: '81101', country: 'SK' },
  defaults: { dueDays: 30, currency: 'EUR', language: 'sk', roundingCash: true }, ...over
});
const contact = (over = {}) => ({ id: 'c1', kind: 'COMPANY', name: 'Odberatel', ico: '12345679', country: 'SK', billingAddress: { city: 'Kosice', country: 'SK' }, dueDays: 10, ...over });
const line = (over = {}) => ({ id: 'l1', kind: 'ITEM', name: 'Sluzba', qty: '2', unitPrice: '100', vatCategory: 'S', vatRate: '23', unit: { code: 'HUR', label: 'hod' }, ...over });
const series = (over = {}) => ({ id: 's1', kind: 'INVOICE', mask: 'FA{YYYY}{N:4}', vsMask: null, reset: 'YEARLY', counters: { 2026: 7 }, ...over });
const draft = (over = {}) => ({
  id: 'd1', createdAt: NOW, updatedAt: NOW, kind: 'INVOICE', status: 'DRAFT', currency: 'EUR', issueDate: '2026-10-18', lines: [line()], payments: [], links: [], ...over
});
const issuedInvoice = (over = {}) => ({
  ...draft(), id: 'inv1', status: 'ISSUED', number: 'FA20260001', vs: '20260001', seller: companySnapshot(company()), buyer: contactSnapshot(contact()),
  contactId: 'c1', taxDate: '2026-10-18', dueDate: '2026-11-01', docDiscount: { pct: '10' }, textIntro: 'hi', language: 'sk', ks: '0308',
  totals: { lineNet: '200.00', allowances: '20.00', charges: '0.00', net: '180.00', vat: '41.40', gross: '221.40', prepaid: '0.00', rounding: '0.00', payable: '221.40',
    breakdown: [{ category: 'S', rate: '23', base: '180.00', vat: '41.40' }] }, ...over
});

describe('convertDocument', () => {
  it('knows the allowed targets', () => {
    expect(conversionTargets('QUOTE')).toEqual(['PROFORMA', 'INVOICE', 'ORDER_IN']);
    expect(conversionTargets('INVOICE')).toEqual(['CREDIT_NOTE', 'DEBIT_NOTE', 'DELIVERY_NOTE']);
    expect(conversionTargets('DELIVERY_NOTE')).toEqual([]);
    expect(code(() => convertDocument(draft(), 'QUOTE'))).toBe('CONVERSION_NOT_ALLOWED');
  });

  it('a quote becomes an invoice draft linked to it', () => {
    const quote = issuedInvoice({ kind: 'QUOTE', validUntil: '2026-11-30' });
    const inv = convertDocument(quote, 'INVOICE', { now: NOW, id: 'new1' });
    expect(inv).toMatchObject({ id: 'new1', kind: 'INVOICE', status: 'DRAFT', number: null, vs: null, seriesId: null, issueDate: '2026-10-18', dueDate: null, validUntil: null, totals: null, lockedAt: null, ks: '0308' });
    expect(inv.links).toEqual([{ kind: 'FROM_QUOTE', docId: 'inv1' }]);
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0].id).not.toBe('l1');
    expect(inv.lines[0].id).toMatch(UUID_V7);
    expect(inv.lines[0]).toMatchObject({ name: 'Sluzba', qty: '2', unitPrice: '100' });
    expect(inv.docDiscount).toEqual({ pct: '10' });
    expect(inv.buyer.name).toBe('Odberatel');
    expect(inv.id).not.toBe(quote.id);
    expect(convertDocument(quote, 'PROFORMA').id).toMatch(UUID_V7);
  });

  it('an invoice becomes a credit note with the correction reference and reason', () => {
    const cn = convertDocument(issuedInvoice(), 'CREDIT_NOTE', { now: NOW, reason: ' wrong quantity ' });
    expect(cn.kind).toBe('CREDIT_NOTE');
    expect(cn.links).toEqual([{ kind: 'CORRECTS', docId: 'inv1' }]);
    expect(cn.correctionReason).toBe('wrong quantity');
    expect(code(() => convertDocument(issuedInvoice(), 'CREDIT_NOTE'))).toBe('CORRECTION_REASON_REQUIRED');
    expect(code(() => convertDocument(issuedInvoice(), 'DEBIT_NOTE', { reason: '  ' }))).toBe('CORRECTION_REASON_REQUIRED');
    const partial = convertDocument(issuedInvoice(), 'DEBIT_NOTE', { reason: 'more', lines: [line({ qty: '1' })] });
    expect(partial.lines[0].qty).toBe('1');
  });

  it('an invoice becomes a delivery note without subtotals and discount', () => {
    const dl = convertDocument(issuedInvoice({ lines: [line(), { id: 's', kind: 'SUBTOTAL', name: 'sum', qty: '0', unitPrice: '0', vatCategory: 'S' }] }), 'DELIVERY_NOTE', { now: NOW });
    expect(dl.lines).toHaveLength(1);
    expect(dl.docDiscount).toBeNull();
    expect(dl.links).toEqual([{ kind: 'DELIVERY_FOR', docId: 'inv1' }]);
  });

  it('a paid proforma becomes the final invoice with the advance deducted', () => {
    const proforma = issuedInvoice({ kind: 'PROFORMA', payments: [{ id: 'p', date: '2026-10-20', amount: '221.40', method: 'TRANSFER', source: 'MANUAL' }] });
    const inv = convertDocument(proforma, 'INVOICE', { now: NOW });
    expect(inv.links).toEqual([{ kind: 'FROM_PROFORMA', docId: 'inv1' }, { kind: 'ADVANCE_DEDUCTION', docId: 'inv1', amount: '221.40' }]);
    expect(convertDocument(proforma, 'INVOICE', { amount: '100' }).links[1].amount).toBe('100.00');
    const unpaid = convertDocument(issuedInvoice({ kind: 'PROFORMA' }), 'INVOICE', { now: NOW });
    expect(unpaid.links).toEqual([{ kind: 'FROM_PROFORMA', docId: 'inv1' }]);
  });

  it('an advance tax document becomes the final invoice deducting its total', () => {
    const atd = issuedInvoice({ kind: 'ADVANCE_TAX_DOC' });
    const inv = convertDocument(atd, 'INVOICE', { now: NOW });
    expect(inv.links).toEqual([{ kind: 'ADVANCE_DEDUCTION', docId: 'inv1', amount: '221.40' }]);
    const noTotals = convertDocument(issuedInvoice({ kind: 'ADVANCE_TAX_DOC', totals: null, docDiscount: null }), 'INVOICE', { now: NOW });
    expect(noTotals.links[0].amount).toBe('246.00');
  });

  it('a fully paid proforma becomes the tax document with the same lines', () => {
    const proforma = issuedInvoice({ kind: 'PROFORMA', payments: [{ id: 'p', date: '2026-10-20', amount: '221.40', method: 'TRANSFER', source: 'MANUAL' }] });
    const atd = convertDocument(proforma, 'ADVANCE_TAX_DOC', { now: NOW, paymentDate: '2026-10-20' });
    expect(atd).toMatchObject({ kind: 'ADVANCE_TAX_DOC', taxDate: '2026-10-20', dueDate: '2026-10-18' });
    expect(atd.links).toEqual([{ kind: 'FROM_PROFORMA', docId: 'inv1', amount: '221.40' }]);
    expect(atd.lines[0]).toMatchObject({ name: 'Sluzba', qty: '2', unitPrice: '100' });
    expect(code(() => convertDocument(issuedInvoice({ kind: 'PROFORMA' }), 'ADVANCE_TAX_DOC'))).toBe('ADVANCE_NOT_PAID');
  });

  it('a partly paid proforma becomes the tax document with a gross line per VAT group', () => {
    const proforma = issuedInvoice({
      kind: 'PROFORMA', docDiscount: null, payments: [{ id: 'p', date: '2026-10-20', amount: '100', method: 'TRANSFER', source: 'MANUAL' }],
      lines: [line(), line({ id: 'l2', vatCategory: 'AE', unitPrice: '50', qty: '1', exemptionReasonCode: 'VATEX-EU-AE' })],
      totals: { gross: '296.00', breakdown: [{ category: 'S', rate: '23', base: '200.00', vat: '46.00' }, { category: 'AE', rate: '0', base: '50.00', vat: '0.00', exemptionReasonCode: 'VATEX-EU-AE' }] }
    });
    const atd = convertDocument(proforma, 'ADVANCE_TAX_DOC', { now: NOW, lineName: 'Prijata platba' });
    expect(atd.lines).toHaveLength(2);
    expect(atd.lines[0]).toMatchObject({ name: 'Prijata platba', qty: '1', priceType: 'GROSS', unitPrice: '83.11', vatCategory: 'S', vatRate: '23', unit: { code: 'HUR', label: 'hod' } });
    expect(atd.lines[1]).toMatchObject({ unitPrice: '16.89', vatCategory: 'AE', vatRate: '0', exemptionReasonCode: 'VATEX-EU-AE' });
    expect(atd.docDiscount).toBeNull();
    expect(atd.links[0].amount).toBe('100.00');
    const named = convertDocument(proforma, 'ADVANCE_TAX_DOC', { now: NOW, amount: '10' });
    expect(named.lines[0].name).toBe('Sluzba');
    expect(named.lines.map(l => l.unitPrice)).toEqual(['8.31', '1.69']);
  });

  it('a partial advance on a zero proforma cannot be split', () => {
    const zero = issuedInvoice({ kind: 'PROFORMA', docDiscount: null, lines: [line({ unitPrice: '0' })], totals: { gross: '0.00', breakdown: [{ category: 'S', rate: '23', base: '0.00', vat: '0.00' }] } });
    expect(code(() => convertDocument(zero, 'ADVANCE_TAX_DOC', { amount: '5' }))).toBe('ADVANCE_NOT_PAID');
  });
});

describe('issueDocument', () => {
  const ctx = (over = {}) => ({ company: company(), contact: contact(), series: series(), now: NOW, ...over });

  it('numbers, snapshots, dates, totals and status', () => {
    const { document, series: next } = issueDocument(draft(), ctx());
    expect(document).toMatchObject({ status: 'ISSUED', seriesId: 's1', number: 'FA20260007', vs: '20260007', issueDate: '2026-10-18', taxDate: '2026-10-18', dueDate: '2026-10-28', contactId: 'c1', updatedAt: NOW, language: 'sk' });
    expect(document.seller).toMatchObject({ name: 'Firma s. r. o.', icDph: 'SK2020123457' });
    expect(document.buyer).toMatchObject({ name: 'Odberatel', contactId: 'c1' });
    expect(document.totals).toMatchObject({ net: '200.00', vat: '46.00', gross: '246.00', payable: '246.00', rounding: '0.00' });
    expect(next.counters).toEqual({ 2026: 8 });
    expect(series().counters).toEqual({ 2026: 7 });
  });

  it('keeps given dates, vs and snapshots, uses company due days without a contact', () => {
    const given = draft({ issueDate: '2026-12-31', taxDate: '2026-12-20', dueDate: '2027-01-15', vs: '999', seller: { name: 'Old name', ico: '36835587', dic: '2020123457', icDph: 'SK2020123457', registerEntry: 'x', address: { city: 'B', country: 'SK' } }, buyer: { name: 'Custom buyer', address: { city: 'K', country: 'SK' } } });
    const { document } = issueDocument(given, ctx({ contact: null, series: series({ counters: {} }) }));
    expect(document).toMatchObject({ number: 'FA20260001', vs: '999', taxDate: '2026-12-20', dueDate: '2027-01-15' });
    expect(document.seller.name).toBe('Old name');
    expect(document.buyer.name).toBe('Custom buyer');
    const { document: noDue } = issueDocument(draft({ buyer: { name: 'B', address: { city: 'K', country: 'SK' } } }), ctx({ contact: null }));
    expect(noDue.dueDate).toBe('2026-11-17');
    const { document: fallback } = issueDocument(draft({ buyer: { name: 'B', address: { city: 'K', country: 'SK' } } }), ctx({ contact: null, company: company({ defaults: undefined }) }));
    expect(fallback.dueDate).toBe('2026-11-01');
    expect(fallback.language).toBe('sk');
  });

  it('skips taken numbers and defaults the issue date to today', () => {
    const { document } = issueDocument(draft({ issueDate: null }), ctx({ taken: ['FA20260007'], today: '2026-10-19' }));
    expect(document.number).toBe('FA20260008');
    expect(document.issueDate).toBe('2026-10-19');
    const { document: byClock } = issueDocument(draft({ issueDate: null }), ctx({ today: undefined }));
    expect(byClock.issueDate).toBe('2026-10-18');
  });

  it('applies cash rounding for cash payment when the company rounds', () => {
    const cash = draft({ paymentMethod: 'CASH', lines: [line({ qty: '1', unitPrice: '10.01' })] });
    expect(issueDocument(cash, ctx()).document.totals).toMatchObject({ gross: '12.31', rounding: '-0.01', payable: '12.30' });
    expect(issueDocument(cash, ctx({ cashRounding: false })).document.totals.rounding).toBe('0.00');
    expect(issueDocument(draft({ lines: [line({ qty: '1', unitPrice: '10.01' })] }), ctx({ cashRounding: true })).document.totals.payable).toBe('12.30');
  });

  it('refuses an incomplete tax document and reports what is missing', () => {
    try {
      issueDocument(draft({ lines: [] }), ctx());
      expect.unreachable();
    } catch (e) {
      expect(e.code).toBe('DOCUMENT_INCOMPLETE');
      expect(e.details.missing.map(m => m.code)).toEqual(['LINES']);
    }
    expect(code(() => issueDocument(draft({ lines: [] }), ctx({ force: true })))).toBe('DOCUMENT_INCOMPLETE');
  });

  it('a non-tax document may be forced through with gaps', () => {
    const quote = draft({ kind: 'QUOTE', lines: [line({ name: '' })] });
    const s = series({ kind: 'QUOTE', mask: 'CP{N}' });
    expect(code(() => issueDocument(quote, ctx({ series: s })))).toBe('DOCUMENT_INCOMPLETE');
    expect(issueDocument(quote, ctx({ series: s, force: true })).document.number).toBe('CP7');
  });

  it('checks the context, the series kind and the status', () => {
    expect(code(() => issueDocument(draft(), {}))).toBe('ISSUE_CONTEXT_REQUIRED');
    expect(code(() => issueDocument(draft(), ctx({ series: series({ kind: 'QUOTE' }) })))).toBe('SERIES_KIND_MISMATCH');
    expect(code(() => issueDocument(draft({ status: 'ISSUED' }), ctx()))).toBe('STATUS_TRANSITION_INVALID');
    expect(code(() => issueDocument(draft({ status: 'CANCELLED' }), ctx()))).toBe('STATUS_TRANSITION_INVALID');
    expect(issueDocument(draft({ status: undefined }), ctx()).document.status).toBe('ISSUED');
  });
});
