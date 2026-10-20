// VAT choices of a predajka line, reverse charge (AE, § 69 ods. 12) with
// the buyer's IČ DPH, exemptions from legislation and the VRP2 summary of
// such a receipt.
import { describe, it, expect } from 'vitest';
import {
  salesReceiptVatChoices, salesReceiptVatChoiceOf, salesReceiptVat, salesReceiptBuyerNeed, checkSalesReceiptBuyer, normalizeVatId,
  salesReceiptSeries, salesReceiptLine, issueSalesReceipt, vrpSummary, missingParticulars
} from '../index.js';

const DATE = '2026-10-18';
const NOW = '2026-10-18T08:30:00.000Z';
const payer = { id: 'c1', name: 'Alfa, s. r. o.', vatMode: 'PAYER', icDph: 'SK2020000004', defaults: { currency: 'EUR', language: 'sk' }, series: [] };
const phone = { id: 'i1', name: 'Mobilný telefón', price: '123.00', priceType: 'GROSS', vatCategory: 'S', vatRate: '23', stockTracked: true, unit: { code: 'C62', label: 'ks' } };
const cable = { id: 'i2', name: 'Kábel', price: '10', priceType: 'NET', vatCategory: 'S', vatRate: '23', stockTracked: true, unit: { code: 'C62', label: 'ks' } };
const buyer = { name: 'Beta, s. r. o.', icDph: 'sk 2020 0000 04', contactId: 'k1' };
const series = () => salesReceiptSeries(payer, { id: 's1' }).series;

describe('salesReceiptVatChoices', () => {
  it('offers the rates, the zero rate and the categories of legislation to a VAT payer', () => {
    const values = salesReceiptVatChoices(DATE, payer).map(c => c.value);
    expect(values.slice(0, 3)).toEqual(['S:23', 'S:19', 'S:5']);
    expect(values).toEqual(expect.arrayContaining(['Z', 'E', 'AE', 'K', 'G', 'O']));
  });

  it('offers only outside VAT to a non-payer', () => {
    expect(salesReceiptVatChoices(DATE, { vatMode: 'NONPAYER' })).toEqual([{ value: 'O', category: 'O', rate: null }]);
    expect(salesReceiptVatChoiceOf(phone, { vatMode: 'NONPAYER' })).toBe('O');
  });

  it('starts from the item VAT', () => {
    expect(salesReceiptVatChoiceOf(phone, payer)).toBe('S:23');
    expect(salesReceiptVatChoiceOf({ ...phone, vatCategory: 'AE', vatRate: '0' }, payer)).toBe('AE');
  });
});

describe('salesReceiptVat', () => {
  it('gives reverse charge with the reference to § 69 ods. 12 from legislation', () => {
    expect(salesReceiptVat('AE', DATE, payer)).toEqual({ vatCategory: 'AE', vatRate: '0', exemptionReasonCode: 'VATEX-EU-AE', exemptionReasonText: '§ 69 ods. 12 zákona o DPH' });
    expect(salesReceiptVat('E', DATE, payer)).toMatchObject({ vatCategory: 'E', exemptionReasonCode: 'VATEX-EU-132' });
    expect(salesReceiptVat('S:19', DATE, payer)).toMatchObject({ vatCategory: 'S', vatRate: '19', exemptionReasonCode: null });
  });

  it('refuses a choice that is not offered', () => {
    expect(() => salesReceiptVat('AE', DATE, { vatMode: 'NONPAYER' })).toThrow(expect.objectContaining({ code: 'SALES_RECEIPT_VAT_CHOICE_INVALID' }));
    expect(() => salesReceiptVat('S:', DATE, payer)).toThrow(expect.objectContaining({ code: 'SALES_RECEIPT_VAT_CHOICE_INVALID' }));
    expect(() => salesReceiptVat('X', DATE, payer)).toThrow(expect.objectContaining({ code: 'SALES_RECEIPT_VAT_CHOICE_INVALID' }));
  });
});

describe('salesReceiptLine with a VAT choice', () => {
  it('turns a price with VAT into the price without VAT on a reverse-charge line', () => {
    const line = salesReceiptLine(phone, '1', { company: payer, date: DATE, vat: 'AE' });
    expect(line).toMatchObject({ vatCategory: 'AE', vatRate: '0', unitPrice: '100.0000', priceType: 'NET', exemptionReasonCode: 'VATEX-EU-AE' });
  });

  it('keeps the item VAT without a choice', () => {
    expect(salesReceiptLine(cable, '1', { company: payer, date: DATE })).toMatchObject({ vatCategory: 'S', vatRate: '23', unitPrice: '10', priceType: 'NET' });
    expect(salesReceiptLine(phone, '1', { company: payer, date: DATE, vat: 'S:19' })).toMatchObject({ vatRate: '19', priceType: 'GROSS', unitPrice: '123.00' });
  });
});

describe('the buyer of a reverse-charge receipt', () => {
  const ae = [{ vatCategory: 'AE' }, { vatCategory: 'S' }];

  it('is needed only for AE and K lines', () => {
    expect(salesReceiptBuyerNeed([{ vatCategory: 'S' }, { vatCategory: 'E' }])).toBe(null);
    expect(salesReceiptBuyerNeed(ae)).toBe('AE');
    expect(salesReceiptBuyerNeed([{ vatCategory: 'K' }])).toBe('K');
    expect(checkSalesReceiptBuyer([{ vatCategory: 'S' }], null)).toBe(null);
  });

  it('must be a Slovak VAT payer for reverse charge', () => {
    expect(checkSalesReceiptBuyer(ae, buyer)).toMatchObject({ name: 'Beta, s. r. o.', icDph: 'SK2020000004', dic: '2020000004', contactId: 'k1', vatPayer: true });
    expect(() => checkSalesReceiptBuyer(ae, null)).toThrow(expect.objectContaining({ code: 'SALES_RECEIPT_BUYER_REQUIRED', details: expect.objectContaining({ field: 'name' }) }));
    expect(() => checkSalesReceiptBuyer(ae, { name: 'Beta' })).toThrow(expect.objectContaining({ code: 'SALES_RECEIPT_BUYER_REQUIRED', details: expect.objectContaining({ field: 'icDph' }) }));
    expect(() => checkSalesReceiptBuyer(ae, { name: 'Beta', icDph: 'SK2020000005' })).toThrow(expect.objectContaining({ code: 'SALES_RECEIPT_BUYER_VAT_ID_INVALID' }));
    expect(() => checkSalesReceiptBuyer(ae, { name: 'Gamma', icDph: 'CZ12345679' })).toThrow(expect.objectContaining({ code: 'SALES_RECEIPT_BUYER_NOT_SK' }));
  });

  it('must have the VAT number of another member state for K', () => {
    expect(checkSalesReceiptBuyer([{ vatCategory: 'K' }], { name: 'Gamma', icDph: 'CZ12345679' })).toMatchObject({ icDph: 'CZ12345679', dic: null });
    expect(() => checkSalesReceiptBuyer([{ vatCategory: 'K' }], buyer)).toThrow(expect.objectContaining({ code: 'SALES_RECEIPT_BUYER_NOT_EU' }));
  });

  it('normalizes the VAT number', () => {
    expect(normalizeVatId(' sk 2020.000.004 ')).toBe('SK2020000004');
  });
});

describe('issueSalesReceipt with reverse charge', () => {
  const cart = [{ item: phone, qty: '2', vat: 'AE' }, { item: cable, qty: '1' }];

  it('refuses a reverse-charge receipt without the buyer IČ DPH', () => {
    expect(() => issueSalesReceipt(cart, { company: payer, series: series(), now: NOW })).toThrow(expect.objectContaining({ code: 'SALES_RECEIPT_BUYER_REQUIRED' }));
  });

  it('issues it with the buyer and no VAT on the AE line', () => {
    const { document } = issueSalesReceipt(cart, { company: payer, series: series(), now: NOW, method: 'CARD', buyer });
    expect(document.buyer).toMatchObject({ name: 'Beta, s. r. o.', icDph: 'SK2020000004' });
    expect(document.contactId).toBe('k1');
    expect(document.totals.breakdown).toEqual([
      expect.objectContaining({ category: 'AE', rate: '0', base: '200.00', vat: '0.00' }),
      expect.objectContaining({ category: 'S', rate: '23', base: '10.00', vat: '2.30' })
    ]);
    expect(document.totals.payable).toBe('212.30');
    expect(missingParticulars(document, payer, DATE)).toEqual([]);
  });

  it('gives VRP2 the category, the legal text and the buyer IČ DPH', () => {
    const { document } = issueSalesReceipt(cart, { company: payer, series: series(), now: NOW, method: 'CASH', buyer });
    const summary = vrpSummary(document);
    expect(summary.reverseCharge).toBe(true);
    expect(summary.buyer).toEqual({ name: 'Beta, s. r. o.', icDph: 'SK2020000004' });
    expect(summary.lines[0]).toMatchObject({ category: 'AE', vatRate: '0', unitPrice: '100.00', total: '200.00', exemption: '§ 69 ods. 12 zákona o DPH' });
    expect(summary.vat.map(v => [v.category, v.rate, v.vat])).toEqual([['AE', '0', '0.00'], ['S', '23', '2.30']]);
    expect(summary.texts).toEqual([{ key: 'reverseCharge', text: 'prenesenie daňovej povinnosti' }]);
    expect(summary.payable).toBe('212.30');
  });

  it('keeps the exempt and zero categories apart in the summary', () => {
    const { document } = issueSalesReceipt([{ item: cable, qty: '1', vat: 'E' }, { item: cable, qty: '1', vat: 'Z' }].map((e, i) => ({ ...e, item: { ...e.item, id: `x${i}` } })),
      { company: payer, series: series(), now: NOW, method: 'CARD' });
    const summary = vrpSummary(document);
    expect(summary.vat.map(v => v.category)).toEqual(['E', 'Z']);
    expect(summary.texts.map(x => x.key)).toEqual(['exempt']);
    expect(summary.buyer).toBe(null);
  });
});
