// VAT of a cash voucher: the choices from legislation, the line fields of
// each choice and the IČ DPH a reverse charge voucher needs.
import { describe, it, expect } from 'vitest';
import { cashVatChoices, cashVatLine, cashVatProblems, cashVatAllowed, buildCashVoucher, defaultCashSeries } from './index.js';

const PAYER = { vatMode: 'PAYER' };
const BOOK = { id: 'b', currency: 'EUR' };

describe('cash voucher VAT', () => {
  it('offers the rates valid on the date, reverse charge, exemption and no VAT to a VAT payer', () => {
    expect(cashVatChoices(PAYER, '2026-03-01').map(c => c.value)).toEqual(['S:23', 'S:19', 'S:5', 'AE', 'E', 'O']);
    expect(cashVatChoices(PAYER, '2024-06-01').map(c => c.value)).toEqual(['S:20', 'S:10', 'S:5', 'AE', 'E', 'O']);
  });

  it('offers only "no VAT" to a company that is not a VAT payer', () => {
    expect(cashVatAllowed({ vatMode: 'NONPAYER' })).toBe(false);
    expect(cashVatChoices({ vatMode: 'REGISTERED_7' }, '2026-03-01')).toEqual([{ value: 'O', category: 'O', rate: null }]);
  });

  it('turns a choice into the line fields with the legal reference from legislation', () => {
    expect(cashVatLine('S:19', '2026-03-01')).toEqual({ vatCategory: 'S', vatRate: '19', exemptionReasonCode: null, exemptionReasonText: null });
    expect(cashVatLine('AE', '2026-03-01')).toEqual({ vatCategory: 'AE', vatRate: null, exemptionReasonCode: 'VATEX-EU-AE', exemptionReasonText: '§ 69 ods. 12 zákona o DPH' });
    expect(cashVatLine('E', '2026-03-01')).toMatchObject({ vatCategory: 'E', vatRate: '0', exemptionReasonCode: 'VATEX-EU-132' });
    expect(cashVatLine('O', '2026-03-01').vatCategory).toBe('O');
    expect(() => cashVatLine('K', '2026-03-01')).toThrow(expect.objectContaining({ code: 'VAT_CATEGORY_INVALID' }));
    expect(() => cashVatLine('S:', '2026-03-01')).toThrow(expect.objectContaining({ code: 'VAT_RATE_REQUIRED' }));
  });

  it('reverse charge needs a valid Slovak IČ DPH of the partner', () => {
    expect(cashVatProblems('S', null)).toEqual([]);
    expect(cashVatProblems('AE', { name: 'X' })).toEqual(['CASH_AE_VAT_ID_MISSING']);
    expect(cashVatProblems('AE', { icDph: 'CZ12345678' })).toEqual(['CASH_AE_NOT_DOMESTIC']);
    expect(cashVatProblems('AE', { icDph: 'SK1234567890' })).toEqual(['CASH_AE_VAT_ID_INVALID']);
    expect(cashVatProblems('AE', { icDph: 'sk 2021234567' })).toEqual([]);
  });

  it('a voucher refuses reverse charge without the IČ DPH and stores the partner ids', () => {
    const input = { book: BOOK, kind: 'CASH_OUT', date: '2026-03-12', amount: '300', purpose: 'Šrot', series: defaultCashSeries('CASH_OUT'), vat: 'AE' };
    expect(() => buildCashVoucher({ ...input, partner: { name: 'Zber' } })).toThrow(expect.objectContaining({ code: 'CASH_AE_VAT_ID_MISSING' }));
    const { voucher } = buildCashVoucher({ ...input, partner: { name: 'Zber', icDph: 'sk2021234567', ico: '12345679' }, contactId: 'c1' });
    expect(voucher.seller).toMatchObject({ name: 'Zber', icDph: 'SK2021234567', ico: '12345679', contactId: 'c1' });
    expect(voucher).toMatchObject({ receivedDate: '2026-03-12', totals: expect.objectContaining({ net: '300.00', vat: '0.00', payable: '300.00' }) });
  });

  it('keeps the older vatRate input working', () => {
    const { voucher } = buildCashVoucher({ book: BOOK, kind: 'CASH_IN', date: '2026-03-12', amount: '12.30', purpose: 'x', series: defaultCashSeries('CASH_IN'), vatRate: '23' });
    expect(voucher.lines[0]).toMatchObject({ vatCategory: 'S', vatRate: '23' });
    expect(voucher.receivedDate).toBeNull();
  });
});
