// The XML of the reports against the layout of the official schemas: no
// XML while an error is open, D.1 / D.2 rate columns, the full row order of
// DPHv25, paging of the súhrnný výkaz and the header formats.
import { describe, it, expect } from 'vitest';
import { vatRecords } from './records.js';
import { buildKv } from './kv.js';
import { buildSv } from './sv.js';
import { buildVatReturn } from './vat-return.js';
import { formVersion as taxFormVersion, nameLines, dateText } from './forms.js';

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

describe('report XML', () => {
  it('produces no XML while an error is open', () => {
    const records = vatRecords([doc()], '2026-03', company());
    expect(buildVatReturn(records, { company: company(), type: 'D' }).xml).toBe(null);
    expect(buildKv(records, { company: company({ vatMode: 'REGISTERED_7' }) }).xml).toBe(null);
    expect(buildKv(records, { company: company() }).xml).toContain('<KVDPH_2025 xmlns="https://ekr.financnasprava.sk/Formulare/XSD/kv_dph_2025.xsd">');
  });

  it('sums both reduced rates into ZZn and DZn of D.2 and the standard rate into Z and D', () => {
    const consumer = { name: 'P', address: { country: 'SK' } };
    const lines = [['23', '100.00'], ['19', '100.00'], ['5', '100.00']].map(([rate, price], i) => ({ id: `l${i}`, name: 'X', qty: '1', unitPrice: price, vatRate: rate, vatCategory: 'S' }));
    const kv = buildKv(vatRecords([doc({ buyer: consumer, lines })], '2026-03', company()), { company: company() });
    expect(kv.xml).toContain('<D2 Z="100.00" D="23.00" ZZn="200.00" DZn="24.00"/>');
  });

  it('writes every row of the VAT return in the order of the form', () => {
    const vr = buildVatReturn(vatRecords([doc()], '2026-03', company()), { company: company(), today: '2026-04-10' });
    const order = [...vr.xml.matchAll(/<(r\d+[a-e]?|splneniePodmienok)[ />]/g)].map(m => m[1]);
    expect(order).toEqual(taxFormVersion('dph', '2025-07-01').rowOrder);
    expect(vr.xml).toContain('<r03>100.00</r03>');
    expect(vr.xml).toContain('<r31>23.00</r31>');
    expect(vr.xml).toContain('<datumVyhlasenia>10.04.2026</datumVyhlasenia>');
  });

  it('pages the súhrnný výkaz by twelve records', () => {
    const buyers = Array.from({ length: 13 }, (_, i) => doc({
      buyer: party({ icDph: `DE${String(100000000 + i)}`, address: { country: 'DE' } }),
      lines: [{ id: 'l', name: 'X', qty: '1', unitPrice: '10.00', vatRate: null, vatCategory: 'K' }]
    }));
    const vies = Object.fromEntries(buyers.map(b => [b.buyer.icDph, 'VALID']));
    const sv = buildSv(vatRecords(buyers, '2026-03', company()), { company: company(), type: 'D', vies, today: '2026-04-10' });
    expect((sv.xml.match(/<strana>/g) || []).length).toBe(2);
    // Every page holds twelve records of each part (the schema says so);
    // thirteen of them carry a buyer.
    expect((sv.xml.match(/<zaznam>/g) || []).length).toBe(24);
    expect((sv.xml.match(/<zaznamCast2>/g) || []).length).toBe(24);
    expect((sv.xml.match(/<kodStatu>DE<\/kodStatu>/g) || []).length).toBe(13);
    expect(sv.xml).toContain('<dodatocny>1</dodatocny>');
    expect(sv.xml).toContain('<celkovaHodnota>130.00</celkovaHodnota>');
  });

});

describe('form header helpers', () => {
  it('splits names into lines and writes dates as dd.mm.yyyy', () => {
    expect(nameLines('Biela Orlica s. r. o.')).toEqual(['Biela Orlica s. r. o.']);
    expect(nameLines('a'.repeat(40), 4, 36)).toEqual(['a'.repeat(36), 'aaaa']);
    expect(nameLines('one two three', 2, 7)).toEqual(['one two', 'three']);
    expect(nameLines('')).toEqual([]);
    expect(dateText('2026-04-10')).toBe('10.04.2026');
    expect(dateText(null)).toBe('');
  });
});

