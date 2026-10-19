// Cash vouchers in the evidencia DPH: a receipt with VAT is a sale, an
// expense with VAT a purchase received on its own date, reverse charge
// (§ 69 ods. 12) goes to A.2 or B.1 of the kontrolný výkaz with the
// partner's IČ DPH, and a voucher that only pays an invoice stays out.
import { describe, it, expect } from 'vitest';
import { vatRecords } from './records.js';
import { buildKv } from './kv.js';
import { buildVatReturn } from './vat-return.js';
import { documentTaxPoint } from './closing.js';
import { isTaxCashVoucher } from './vouchers.js';
import { buildCashVoucher, defaultCashSeries } from '../payments/bank/index.js';

const company = { id: 'c', name: 'Firma', vatMode: 'PAYER', vatPeriod: 'MONTH', icDph: 'SK2020123457', ico: '12345679', address: { country: 'SK' }, closedPeriods: [] };
const BOOK = { id: 'b1', currency: 'EUR', openingBalance: '0' };
const PAYER = { name: 'Zberne suroviny s.r.o.', icDph: 'SK2021234567', address: { country: 'SK' } };

function voucher(kind, vat, amount, extra = {}) {
  return buildCashVoucher({ book: BOOK, kind, date: '2026-03-12', amount, purpose: 'Test', series: defaultCashSeries(kind), vat, ...extra }).voucher;
}

describe('cash vouchers in the VAT records', () => {
  it('an expense with VAT is a deductible purchase dated by its payment day', () => {
    const v = voucher('CASH_OUT', 'S:23', '123.00', { partner: { name: 'Papiernictvo' } });
    const records = vatRecords([v], '2026-03', company);
    expect(records.entries).toEqual([expect.objectContaining({
      docId: v.id, direction: 'IN', treatment: 'DOMESTIC', category: 'S', rate: '23', base: '100.00', vat: '23.00', deductible: '23.00',
      date: '2026-03-12', simplified: true, cashVoucher: true
    })]);
    expect(records.problems).toEqual([]);
    expect(records.totals).toMatchObject({ deductibleVat: '23.00', outputVat: '0.00' });
    expect(buildKv(records, { company }).sections.B3.total).toMatchObject({ base: '100.00', deductible: '23.00' });
  });

  it('a receipt with VAT is a sale: A.1 for a Slovak payer, D.2 otherwise', () => {
    const toPayer = voucher('CASH_IN', 'S:23', '246.00', { partner: PAYER });
    const toPerson = voucher('CASH_IN', 'S:5', '10.50', { partner: { name: 'Jan' } });
    const records = vatRecords([toPayer, toPerson], '2026-03', company);
    expect(records.totals.outputVat).toBe('46.50');
    const kv = buildKv(records, { company });
    expect(kv.sections.A1).toEqual([expect.objectContaining({ docId: toPayer.id, buyer: 'SK2021234567', base: '200.00', vat: '46.00' })]);
    expect(kv.sections.D2).toEqual([expect.objectContaining({ rate: '5', base: '10.00', vat: '0.50' })]);
  });

  it('reverse charge on a sale goes to A.2 without VAT, on a purchase to B.1 self-assessed', () => {
    const sale = voucher('CASH_IN', 'AE', '500.00', { partner: PAYER });
    const purchase = voucher('CASH_OUT', 'AE', '300.00', { partner: PAYER });
    expect(sale.lines[0]).toMatchObject({ vatCategory: 'AE', vatRate: null, exemptionReasonCode: 'VATEX-EU-AE' });
    const records = vatRecords([sale, purchase], '2026-03', company);
    expect(records.entries.map(e => [e.direction, e.treatment, e.base, e.vat, e.deductible])).toEqual([
      ['OUT', 'DOMESTIC_RC', '500.00', '0.00', '0.00'],
      ['IN', 'DOMESTIC_RC', '300.00', '69.00', '69.00']
    ]);
    const kv = buildKv(records, { company });
    expect(kv.sections.A2).toEqual([expect.objectContaining({ buyer: 'SK2021234567', base: '500.00' })]);
    expect(kv.sections.B1).toEqual([expect.objectContaining({ supplier: 'SK2021234567', base: '300.00', vat: '69.00', deductible: '69.00' })]);
    expect(kv.problems.filter(p => p.severity === 'error')).toEqual([]);
    const vr = buildVatReturn(records, { company });
    expect(vr.amounts['reverseChargeIssued.base']).toBe('500.00');
  });

  it('an exempt voucher is listed without VAT', () => {
    const v = voucher('CASH_IN', 'E', '80.00', { partner: { name: 'Jan' } });
    expect(v.lines[0]).toMatchObject({ vatCategory: 'E', vatRate: '0', exemptionReasonCode: 'VATEX-EU-132' });
    const [entry] = vatRecords([v], '2026-03', company).entries;
    expect(entry).toMatchObject({ treatment: 'EXEMPT', base: '80.00', vat: '0.00' });
  });

  it('leaves out vouchers without VAT, vouchers paying an invoice and cancelled ones', () => {
    const none = voucher('CASH_IN', 'O', '50.00');
    const paying = voucher('CASH_IN', 'S:23', '123.00', { paysDocId: 'inv-1', paymentId: 'p1' });
    const cancelled = { ...voucher('CASH_OUT', 'S:23', '123.00'), status: 'CANCELLED' };
    expect([none, paying].map(isTaxCashVoucher)).toEqual([false, false]);
    expect(vatRecords([none, paying, cancelled], '2026-03', company).entries).toEqual([]);
  });

  it('an older expense voucher without a received date is placed by its date, and closing reads it as a purchase', () => {
    const v = { ...voucher('CASH_OUT', 'S:23', '12.30'), receivedDate: null };
    const records = vatRecords([v], '2026-03', company);
    expect(records.entries).toHaveLength(1);
    expect(records.problems).toEqual([]);
    expect(documentTaxPoint(v, company)).toBe('2026-03-12');
  });

  it('a company that is not a VAT payer keeps no records', () => {
    const v = voucher('CASH_OUT', 'S:23', '123.00');
    expect(vatRecords([v], '2026-03', { ...company, vatMode: 'NONPAYER' }).entries).toEqual([]);
  });
});
