// getLegislation picks the entry in force on a date, inclusive on both
// ends, and names what is still unverified.
import { describe, it, expect } from 'vitest';
import { getLegislation, unverifiedLegislation, validOn, exemptionReasonsOn, LEGISLATION } from './index.js';
import { CoreError } from '../errors.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };

describe('getLegislation', () => {
  it('returns the VAT rates valid on a date', () => {
    const rates = getLegislation('vatRates', '2026-10-18');
    expect(rates.map(r => [r.code, r.rate])).toEqual([['STANDARD', '23'], ['REDUCED_1', '19'], ['REDUCED_2', '5']]);
  });

  it('switches on the boundary dates', () => {
    expect(getLegislation('vatRates.STANDARD.rate', '2024-12-31')).toBe('20');
    expect(getLegislation('vatRates.STANDARD.rate', '2025-01-01')).toBe('23');
    expect(getLegislation('vatRates.REDUCED_1.rate', '2024-12-31')).toBe('10');
    expect(getLegislation('vatRates.REDUCED_1.rate', '2025-01-01')).toBe('19');
  });

  it('a code without an entry on the date is not in force', () => {
    expect(code(() => getLegislation('vatRates.REDUCED_2', '2022-12-31'))).toBe('LEGISLATION_NOT_IN_FORCE');
    expect(getLegislation('vatRates.REDUCED_2.rate', '2023-01-01')).toBe('5');
  });

  it('walks into plain sections', () => {
    expect(getLegislation('deadlines.invoiceIssueDays', '2026-10-18')).toBe(15);
    expect(getLegislation('einvoice.mandatoryFrom', '2026-10-18')).toBe('2027-01-01');
    expect(getLegislation('texts.reverseCharge.sk', '2026-10-18')).toBe('prenesenie daňovej povinnosti');
    expect(getLegislation('cashRounding.step', '2026-10-18')).toBe('0.05');
    expect(getLegislation('recoveryCostFlat', '2026-10-18').amount).toBe('40');
  });

  it('fails before the first entry', () => {
    expect(code(() => getLegislation('vatRates', '2010-12-31'))).toBe('LEGISLATION_NOT_IN_FORCE');
    expect(code(() => getLegislation('einvoice', '2025-12-31'))).toBe('LEGISLATION_NOT_IN_FORCE');
    expect(getLegislation('einvoice', '2026-01-01').law).toContain('385/2025');
  });

  it('fails on unknown keys, paths, countries and dates with stable codes', () => {
    expect(code(() => getLegislation('nope', '2026-01-01'))).toBe('LEGISLATION_KEY_UNKNOWN');
    expect(code(() => getLegislation('deadlines.nope', '2026-01-01'))).toBe('LEGISLATION_KEY_UNKNOWN');
    expect(code(() => getLegislation('deadlines.vatReturnDay.deeper', '2026-01-01'))).toBe('LEGISLATION_KEY_UNKNOWN');
    expect(code(() => getLegislation('vatRates', '2026-01-01', 'CZ'))).toBe('LEGISLATION_COUNTRY_UNKNOWN');
    expect(code(() => getLegislation('vatRates', '18.10.2026'))).toBe('DATE_INVALID');
    expect(code(() => getLegislation('vatRates'))).toBe('DATE_INVALID');
    expect(() => getLegislation('$comment', '2026-01-01')).toThrow(CoreError);
  });

  it('accepts the country in lower case', () => {
    expect(getLegislation('archiveYears.years', '2026-01-01', 'sk')).toBe(10);
  });

  it('exemption reasons by category', () => {
    expect(exemptionReasonsOn('AE', '2026-01-01')[0].code).toBe('VATEX-EU-AE');
    expect(exemptionReasonsOn('S', '2026-01-01')).toEqual([]);
  });
});

describe('validOn', () => {
  it('is inclusive on both ends', () => {
    const e = { validFrom: '2025-01-01', validTo: '2025-12-31' };
    expect(validOn(e, '2024-12-31')).toBe(false);
    expect(validOn(e, '2025-01-01')).toBe(true);
    expect(validOn(e, '2025-12-31')).toBe(true);
    expect(validOn(e, '2026-01-01')).toBe(false);
    expect(validOn({ validFrom: '2025-01-01', validTo: null }, '2999-01-01')).toBe(true);
  });
});

describe('unverifiedLegislation', () => {
  it('lists every entry that is not verified, by section, code and date', () => {
    const list = unverifiedLegislation();
    expect(list).toContain('vatRates/STANDARD/2025-01-01');
    expect(list).toContain('deadlines/2014-01-01');
    const total = Object.entries(LEGISLATION.SK).filter(([k, v]) => Array.isArray(v) && !k.startsWith('$')).reduce((n, [, v]) => n + v.length, 0);
    const verified = Object.values(LEGISLATION.SK).filter(Array.isArray).flat().filter(e => e.verified === true).length;
    expect(list.length).toBe(total - verified);
  });

  it('rejects an unknown country', () => {
    expect(code(() => unverifiedLegislation('XX'))).toBe('LEGISLATION_COUNTRY_UNKNOWN');
  });
});
