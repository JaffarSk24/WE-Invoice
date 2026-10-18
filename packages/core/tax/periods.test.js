import { describe, it, expect } from 'vitest';
import { parsePeriod, periodOf, inPeriod, periodKindOf, previousPeriod, nextPeriod, monthsOf, periodContains, filingDueDate, isPeriodKey } from './periods.js';
import { treatmentOf, partnerCountry, vatIdCountry, documentDirection, isSelfAssessed } from './treatment.js';
import { escapeXml, el, toXml } from './xml.js';
import { amountText, rateText, splitStreet, formVersion, unverifiedForms } from './forms.js';

describe('tax periods', () => {
  it('parses months and quarters with their first and last day', () => {
    expect(parsePeriod('2026-02')).toMatchObject({ kind: 'MONTH', year: 2026, month: 2, from: '2026-02-01', to: '2026-02-28' });
    expect(parsePeriod('2028-02').to).toBe('2028-02-29');
    expect(parsePeriod('2026-Q4')).toMatchObject({ kind: 'QUARTER', quarter: 4, from: '2026-10-01', to: '2026-12-31' });
    expect(() => parsePeriod('2026-13')).toThrow(expect.objectContaining({ code: 'TAX_PERIOD_INVALID' }));
    expect(() => parsePeriod('2026-Q5')).toThrow(expect.objectContaining({ code: 'TAX_PERIOD_INVALID' }));
    expect(isPeriodKey('2026-Q1')).toBe(true);
    expect(isPeriodKey('2026-1')).toBe(false);
  });

  it('places a date into its month or quarter', () => {
    expect(periodOf('2026-03-31')).toBe('2026-03');
    expect(periodOf('2026-03-31', 'QUARTER')).toBe('2026-Q1');
    expect(periodOf('2026-04-01', 'QUARTER')).toBe('2026-Q2');
    expect(inPeriod('2026-03-31', '2026-Q1')).toBe(true);
    expect(inPeriod('2026-04-01', '2026-Q1')).toBe(false);
    expect(inPeriod(null, '2026-Q1')).toBe(false);
  });

  it('moves between periods across the year end', () => {
    expect(previousPeriod('2026-01')).toBe('2025-12');
    expect(nextPeriod('2026-12')).toBe('2027-01');
    expect(previousPeriod('2026-Q1')).toBe('2025-Q4');
    expect(nextPeriod('2026-Q4')).toBe('2027-Q1');
    expect(monthsOf('2026-Q3')).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(periodContains('2026-Q3', '2026-08')).toBe(true);
    expect(periodContains('2026-08', '2026-Q3')).toBe(false);
  });

  it('takes the period kind from the company', () => {
    expect(periodKindOf({ vatPeriod: 'QUARTER' })).toBe('QUARTER');
    expect(periodKindOf({})).toBe('MONTH');
    expect(periodKindOf(null)).toBe('MONTH');
  });

  it('computes the filing deadline from legislation', () => {
    expect(filingDueDate('2026-03', 'kv')).toBe('2026-04-25');
    expect(filingDueDate('2026-12', 'vatReturn')).toBe('2027-01-25');
    expect(filingDueDate('2026-Q1', 'sv')).toBe('2026-04-25');
  });
});

describe('VAT treatment', () => {
  const sk = { icDph: 'SK2021234567', address: { country: 'SK' } };
  const de = { icDph: 'DE123456789', address: { country: 'DE' } };
  const us = { address: { country: 'US' } };

  it('reads the partner country from the address, then the VAT id', () => {
    expect(partnerCountry({ icDph: 'EL123456789' })).toBe('GR');
    expect(partnerCountry({})).toBe('SK');
    expect(vatIdCountry('x')).toBe(null);
  });

  it('classifies issued groups', () => {
    expect(treatmentOf({ category: 'S' }, 'OUT', sk)).toBe('DOMESTIC');
    expect(treatmentOf({ category: 'AE' }, 'OUT', sk)).toBe('DOMESTIC_RC');
    expect(treatmentOf({ category: 'AE' }, 'OUT', de)).toBe('EU_SERVICES');
    expect(treatmentOf({ category: 'AE' }, 'OUT', us)).toBe('OUTSIDE');
    expect(treatmentOf({ category: 'K' }, 'OUT', de)).toBe('EU_GOODS');
    expect(treatmentOf({ category: 'G' }, 'OUT', us)).toBe('EXPORT');
    expect(treatmentOf({ category: 'E' }, 'OUT', sk)).toBe('EXEMPT');
    expect(treatmentOf({ category: 'S' }, 'OUT', { address: { country: 'DE' } }, { oss: true })).toBe('OSS');
    expect(treatmentOf({ category: 'S' }, 'OUT', { address: { country: 'DE' } }, { oss: false })).toBe('DOMESTIC');
  });

  it('classifies received groups', () => {
    expect(treatmentOf({ category: 'S' }, 'IN', sk)).toBe('DOMESTIC');
    expect(treatmentOf({ category: 'S' }, 'IN', de)).toBe('FOREIGN');
    expect(treatmentOf({ category: 'S' }, 'IN', us)).toBe('IMPORT');
    expect(treatmentOf({ category: 'AE' }, 'IN', sk)).toBe('DOMESTIC_RC');
    expect(treatmentOf({ category: 'AE' }, 'IN', de)).toBe('EU_SERVICES');
    expect(treatmentOf({ category: 'AE' }, 'IN', us)).toBe('THIRD_SERVICES');
    expect(treatmentOf({ category: 'K' }, 'IN', de)).toBe('EU_GOODS_ACQ');
    expect(treatmentOf({ category: 'K' }, 'IN', sk)).toBe('INVALID');
    expect(isSelfAssessed('EU_GOODS_ACQ', 'IN')).toBe(true);
    expect(isSelfAssessed('EU_GOODS', 'OUT')).toBe(false);
  });

  it('treats a self-billed invoice where the company is the buyer as a purchase', () => {
    const company = { ico: '36835587', icDph: 'SK2020123457' };
    expect(documentDirection({ kind: 'SELF_BILLING', buyer: { ico: '36835587' } }, company)).toBe('IN');
    expect(documentDirection({ kind: 'SELF_BILLING', buyer: { ico: '11111111' } }, company)).toBe('OUT');
    expect(documentDirection({ kind: 'RECEIVED_INVOICE' }, company)).toBe('IN');
  });
});

describe('XML writer and form helpers', () => {
  it('escapes text and attributes and drops control characters', () => {
    expect(escapeXml('a & b < "c" \u0001')).toBe('a &amp; b &lt; &quot;c&quot; ');
    expect(toXml(el('A', { x: 'a"b', y: null }, el('B', {}, 'R&D'), el('C')))).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n<A x="a&quot;b">\n  <B>R&amp;D</B>\n  <C/>\n</A>\n');
  });

  it('formats amounts, rates and street numbers', () => {
    expect(amountText('12.5')).toBe('12.50');
    expect(amountText(null)).toBe('0.00');
    expect(rateText('23.00')).toBe('23');
    expect(rateText('9.50')).toBe('9.5');
    expect(rateText(null)).toBe(null);
    expect(splitStreet('Hlavná 12/A')).toEqual(['Hlavná', '12/A']);
    expect(splitStreet('Nám. SNP 3')).toEqual(['Nám. SNP', '3']);
    expect(splitStreet('Dolná Lehota')).toEqual(['Dolná Lehota', '']);
  });

  it('picks the form version by the period and lists unverified ones', () => {
    expect(formVersion('dph', '2025-07-01').form).toBe('DPHv25');
    expect(() => formVersion('dph', '2025-06-01')).toThrow(expect.objectContaining({ code: 'TAX_FORM_NOT_AVAILABLE' }));
    expect(formVersion('kv', '2025-01-01').form).toBe('KVDPHv25');
    expect(unverifiedForms()).toEqual(expect.arrayContaining(['kv/KVDPHv25/2025-01-01', 'dph/DPHv25/2025-07-01']));
  });
});
