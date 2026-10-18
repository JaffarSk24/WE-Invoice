import { describe, it, expect } from 'vitest';
import data from './providers.json' with { type: 'json' };

describe('peppol/providers.json', () => {
  it('lists the first-wave providers and the generic SAPI-SK one', () => {
    expect(data.providers.map(p => p.id)).toEqual(['verteco', 'dativery', 'epostak', 'ipostar', 'sapi-sk']);
  });

  it.each(data.providers.map(p => [p.id, p]))('%s has the wizard fields', (_id, p) => {
    expect(p.name).toBeTruthy();
    expect(['SAPI_SK', 'NATIVE']).toContain(p.protocol);
    expect(p.baseUrl).toHaveProperty('prod');
    expect(p.baseUrl).toHaveProperty('sandbox');
    expect(p.tariff.sk).toBeTruthy();
    expect(p.tariff.en).toBeTruthy();
    expect(p.flags).toHaveProperty('freeReceive');
  });
});
