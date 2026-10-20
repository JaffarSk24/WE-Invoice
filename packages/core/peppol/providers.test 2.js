import { describe, it, expect } from 'vitest';
import data from './providers.json' with { type: 'json' };

const IDS = data.providers.map(p => p.id);

describe('peppol/providers.json', () => {
  it('has unique ids and keeps the first-wave adapters and the generic SAPI-SK entry last', () => {
    expect(new Set(IDS).size).toBe(IDS.length);
    ['verteco', 'dativery', 'epostak', 'ipostar'].forEach(id => expect(IDS).toContain(id));
    expect(IDS[IDS.length - 1]).toBe('sapi-sk');
  });

  it.each(data.providers.map(p => [p.id, p]))('%s has the wizard fields', (_id, p) => {
    expect(p.name).toBeTruthy();
    expect(['SAPI_SK', 'NATIVE']).toContain(p.protocol);
    expect(['AVAILABLE', 'ANNOUNCED', 'NONE', 'UNKNOWN']).toContain(p.api);
    expect(['YES', 'ANNOUNCED', 'NO', 'UNKNOWN']).toContain(p.sapiSk);
    expect(['SMALL', 'ERP', 'FOREIGN']).toContain(p.segment);
    expect(p.baseUrl).toHaveProperty('prod');
    expect(p.baseUrl).toHaveProperty('sandbox');
    expect(p.tariff.sk).toBeTruthy();
    expect(p.tariff.en).toBeTruthy();
    expect(p.flags).toHaveProperty('freeReceive');
  });

  it('an SAPI-SK provider connects through the universal adapter or a native one', () => {
    data.providers.filter(p => p.sapiSk === 'YES' && p.api === 'AVAILABLE').forEach(p => expect(p.adapter, p.id).toBeTruthy());
  });
});
