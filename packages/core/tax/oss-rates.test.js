// OSS data against a table of EU VAT rates. The shipped table is still empty,
// so this file loads a small table of its own to check the rule: a rate the
// buyer's country does not have is a warning, a known rate is not.
import { describe, it, expect, vi } from 'vitest';
import { vatRecords } from './records.js';
import { ossData } from './oss.js';

vi.mock('../legislation/eu-vat-rates.json', () => ({
  default: { countries: { DE: { rates: ['19', '7'] }, AT: { rates: ['20', '13', '10'] } } }
}));

const company = { id: 'c', name: 'Firma', vatMode: 'PAYER', vatPeriod: 'QUARTER', oss: true, icDph: 'SK2020123457', address: { country: 'SK' }, closedPeriods: [] };
let n = 0;
const sale = (country, rate) => {
  n += 1;
  return {
    id: `o${n}`, kind: 'INVOICE', status: 'ISSUED', number: `F${n}`, issueDate: '2026-02-10', taxDate: '2026-02-10', currency: 'EUR',
    seller: { name: 'Me', icDph: 'SK2020123457', address: { country: 'SK' } }, buyer: { name: 'C', address: { country } }, payments: [], links: [],
    lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: '100.00', vatRate: rate, vatCategory: 'S' }]
  };
};

describe('OSS rates check', () => {
  it('warns about a rate the country does not have and still sums it', () => {
    const wrong = sale('DE', '21');
    const data = ossData(vatRecords([sale('DE', '19'), wrong, sale('AT', '20')], '2026-Q1', company));
    expect(data.rows).toEqual([
      { country: 'AT', rate: '20', base: '100.00', vat: '20.00' },
      { country: 'DE', rate: '21', base: '100.00', vat: '21.00' },
      { country: 'DE', rate: '19', base: '100.00', vat: '19.00' }
    ]);
    expect(data.problems).toEqual([expect.objectContaining({ code: 'OSS_RATE_UNKNOWN', docId: wrong.id, severity: 'warning', params: { country: 'DE', rate: '21' } })]);
  });

  it('does not check a country missing from the table', () => {
    expect(ossData(vatRecords([sale('FR', '99')], '2026-Q1', company)).problems).toEqual([]);
  });
});
