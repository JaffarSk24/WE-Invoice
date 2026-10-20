// Every legislation value carries its validity and source, and stays
// unverified until checked against the source (05-accounting-tax.md).
import { describe, it, expect } from 'vitest';
import sk from './sk.json' with { type: 'json' };

const sections = Object.entries(sk).filter(([k]) => !k.startsWith('$') && k !== 'country');

describe('legislation/sk.json', () => {
  it('has every key of 05-accounting-tax.md § 5.1', () => {
    ['vatRates', 'vatRegistrationThreshold', 'flatExpenses', 'latePaymentInterest', 'recoveryCostFlat', 'deadlines',
      'archiveYears', 'texts', 'einvoice', 'depreciation', 'travel'].forEach(k => expect(sk[k], k).toBeTruthy());
  });

  it.each(sections.map(([k]) => k))('%s entries have validFrom, source and verified', (key) => {
    sk[key].forEach(entry => {
      expect(entry.validFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.source).toMatch(/^https:\/\//);
      expect(typeof entry.verified).toBe('boolean');
      expect('verifiedAt' in entry).toBe(true);
    });
  });

  it('amounts and rates are decimal strings', () => {
    sk.vatRates.forEach(r => expect(typeof r.rate).toBe('string'));
    expect(typeof sk.recoveryCostFlat[0].amount).toBe('string');
  });
});
