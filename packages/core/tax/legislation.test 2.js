// The legislation values the tax reports read, at the edges of their
// validity (05-accounting-tax.md § 5.5).
import { describe, it, expect } from 'vitest';
import { getLegislation } from '../legislation/index.js';

describe('tax legislation values on their boundaries', () => {
  it.each([
    ['2024-12-31', 'STANDARD', '20'], ['2025-01-01', 'STANDARD', '23'],
    ['2024-12-31', 'REDUCED_1', '10'], ['2025-01-01', 'REDUCED_1', '19'],
    ['2022-12-31', 'REDUCED_2', null], ['2023-01-01', 'REDUCED_2', '5'], ['2025-01-01', 'REDUCED_2', '5']
  ])('rate on %s: %s = %s', (date, code, rate) => {
    if (rate === null) expect(() => getLegislation(`vatRates.${code}.rate`, date)).toThrow(expect.objectContaining({ code: 'LEGISLATION_NOT_IN_FORCE' }));
    else expect(getLegislation(`vatRates.${code}.rate`, date)).toBe(rate);
  });

  it('registration limit from 2025', () => {
    expect(() => getLegislation('vatRegistrationThreshold.amount', '2024-12-31')).toThrow(expect.objectContaining({ code: 'LEGISLATION_NOT_IN_FORCE' }));
    expect(getLegislation('vatRegistrationThreshold.amount', '2025-01-01')).toBe('50000');
    expect(getLegislation('vatRegistrationThreshold.immediate', '2025-01-01')).toBe('62500');
  });

  it('filing days', () => {
    expect(() => getLegislation('deadlines.kvDay', '2013-12-31')).toThrow(expect.objectContaining({ code: 'LEGISLATION_NOT_IN_FORCE' }));
    for (const key of ['vatReturnDay', 'kvDay', 'svDay']) expect(getLegislation(`deadlines.${key}`, '2014-01-01')).toBe(25);
  });

  it('end of the kontrolný výkaz', () => {
    expect(getLegislation('einvoice.kvAbolishedFrom', '2026-01-01')).toBe('2030-07-01');
  });
});
