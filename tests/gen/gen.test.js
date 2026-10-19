// The generator: the same seed gives the same data, every identifier
// passes the checks of the core, and the stored totals are the computed
// ones.
import { describe, it, expect } from 'vitest';
import { isValidIco, isValidDic, isValidVatId, isValidIban, computeTotals } from '@we-invoice/core';
import { generateCompanyData, icoFrom, dicFrom, ibanFrom } from './index.js';

describe('synthetic data generator', () => {
  it('is deterministic', () => {
    const a = generateCompanyData({ documents: 200, seed: 7 });
    const b = generateCompanyData({ documents: 200, seed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(generateCompanyData({ documents: 200, seed: 8 }))).not.toBe(JSON.stringify(a));
  });

  it('makes identifiers with valid checksums', () => {
    for (let i = 0; i < 500; i += 1) {
      expect(isValidIco(icoFrom(i * 104729))).toBe(true);
      expect(isValidDic(dicFrom(i * 7907))).toBe(true);
      expect(isValidIban(ibanFrom(1100 + (i % 3) * 100, i * 31337))).toBe(true);
    }
    const { company, contacts } = generateCompanyData({ documents: 0 });
    expect(isValidVatId(company.icDph)).toBe(true);
    expect(contacts.every(c => isValidIco(c.ico) && isValidDic(c.dic) && isValidIban(c.iban))).toBe(true);
  });

  it('keeps unique numbers and the computed totals', () => {
    const { documents } = generateCompanyData({ documents: 2000 });
    expect(new Set(documents.map(d => d.number)).size).toBe(2000);
    for (const doc of documents.slice(0, 200)) expect(doc.totals).toEqual(computeTotals(doc));
    expect(documents.some(d => d.payments.length)).toBe(true);
    expect(new Set(documents.map(d => d.kind)).size).toBeGreaterThanOrEqual(5);
  });
});
