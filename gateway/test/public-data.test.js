import { describe, it, expect, afterEach, vi } from 'vitest';
import { createTestApp, json, fakeResolver, privateLookup } from './helpers.js';
import { ECB_XML, EKASA_RECEIPT, SMP_XML, INVOICE_DOCTYPE, NAPTR_RECORD } from './fixtures.js';
import { parseEurofxref, pickDay } from '../src/upstream/ecb.js';
import { mapReceipt, toIso } from '../src/upstream/ekasa.js';
import { base32, naptrLabel, legacyLabel, naptrName, legacyName, smpUrlFromNaptr, createSmlLookup } from '../src/upstream/peppol-sml.js';
import { parseServiceGroup, encodeParticipant } from '../src/upstream/peppol-smp.js';
import { localDate } from '../src/lib/time.js';

const ECB = 'https://www.ecb.europa.eu';
const ZONE = 'edelivery.tech.ec.europa.eu';
let ctx;
afterEach(async () => { if (ctx) await ctx.app.close(); ctx = null; vi.useRealTimers(); });

describe('ECB rates', () => {
  it('parses the eurofxref file and picks the latest day on or before a date', () => {
    const t = parseEurofxref(ECB_XML);
    expect(t['2026-10-16']).toEqual({ USD: '1.0876', CZK: '24.355', PLN: '4.2690' });
    expect(pickDay(t, '2026-10-18')).toBe('2026-10-16');
    expect(pickDay(t, '2026-10-15')).toBe('2026-10-15');
    expect(pickDay(t, '2026-10-01')).toBeNull();
  });

  it('serves rates with a date, today by default, from the 90-day file', async () => {
    ctx = await createTestApp();
    ctx.pool(ECB).intercept({ path: '/stats/eurofxref/eurofxref-hist-90d.xml' }).reply(200, ECB_XML);
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/rates/ecb?date=2026-10-17' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ date: '2026-10-16', base: 'EUR', rates: { USD: '1.0876', CZK: '24.355', PLN: '4.2690' } });
    res = await ctx.app.inject({ method: 'GET', url: '/v1/rates/ecb?date=2026-10-17' });
    expect(res.statusCode).toBe(200);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/rates/ecb' });
    expect(res.statusCode).toBe(200);
    expect(res.json().date).toBe('2026-10-16');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/rates/ecb?date=2099-01-01' });
    expect(res.statusCode).toBe(400);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/rates/ecb?date=nope' });
    expect(res.statusCode).toBe(400);
  });

  it('falls back to the full history for old dates and answers 404 before the euro', async () => {
    ctx = await createTestApp();
    const pool = ctx.pool(ECB);
    pool.intercept({ path: '/stats/eurofxref/eurofxref-hist.xml' }).reply(200, ECB_XML.replace('2026-10-16', '2025-06-30'));
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/rates/ecb?date=2025-07-01' });
    expect(res.json().date).toBe('2025-06-30');
    pool.intercept({ path: '/stats/eurofxref/eurofxref-hist-90d.xml' }).reply(200, '<Cube></Cube>');
    pool.intercept({ path: '/stats/eurofxref/eurofxref-hist.xml' }).reply(200, ECB_XML);
    res = await ctx.app.inject({ method: 'GET', url: `/v1/rates/ecb?date=${localDate()}` });
    expect(res.statusCode).toBe(502);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/rates/ecb?date=1998-01-01' });
    expect(res.statusCode).toBe(404);
  });

  it('serves a recent date missing from the 90-day file from the history', async () => {
    ctx = await createTestApp();
    const pool = ctx.pool(ECB);
    pool.intercept({ path: '/stats/eurofxref/eurofxref-hist-90d.xml' }).reply(200, ECB_XML);
    pool.intercept({ path: '/stats/eurofxref/eurofxref-hist.xml' }).reply(200, ECB_XML.replace('2026-10-15', '2026-09-01'));
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/rates/ecb?date=2026-09-10' });
    expect(res.json().date).toBe('2026-09-01');
  });
});

describe('eKasa receipt', () => {
  it('maps the receipt with string amounts and UTC time', () => {
    const r = mapReceipt(EKASA_RECEIPT, 'X');
    expect(r).toMatchObject({ receiptId: 'O-1234567890ABCDEF1234567890ABCDEF', okp: 'abcd1234-ef567890-12345678-90abcdef-12345678', issuedAt: '2026-10-17T12:05:33.000Z' });
    expect(r.seller).toEqual({ name: 'Predajňa s. r. o.', ico: '12345678', dic: '2020123456', icDph: 'SK2020123456', address: 'Hlavná 1 81101 Bratislava' });
    expect(r.items[0]).toEqual({ name: 'Káva', qty: '2', price: '5', vatRate: '23' });
    expect(r.totals).toEqual({ total: '12.5', vat: { basic: '2.08' } });
    expect(mapReceipt({ receipt: null }, 'X')).toBeNull();
    expect(mapReceipt({ searchResult: false, receipt: { receiptId: 'a' } }, 'X')).toBeNull();
    expect(mapReceipt({ okp: 'o', items: [{}] }, 'X')).toMatchObject({ receiptId: 'X', items: [{ name: '', qty: '1', price: '0', vatRate: '0' }] });
    expect(toIso('2026-01-01T10:00:00Z')).toBe('2026-01-01T10:00:00.000Z');
    expect(toIso('01.01.2026')).toBe('2025-12-31T23:00:00.000Z');
    expect(toIso('junk')).toBeNull();
    expect(toIso('')).toBeNull();
  });

  it('POST /v1/ekasa/receipt answers the receipt, 404 and 400', async () => {
    ctx = await createTestApp();
    const pool = ctx.pool('https://ekasa.financnasprava.sk');
    pool.intercept({ path: '/mdu/api/v1/opd/receipt/find', method: 'POST', body: (b) => JSON.parse(b).receiptId === 'O-1234567890ABCDEF1234567890ABCDEF' }).reply(200, EKASA_RECEIPT, json);
    let res = await ctx.app.inject({ method: 'POST', url: '/v1/ekasa/receipt', payload: { receiptId: ' O-1234567890ABCDEF1234567890ABCDEF ' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().totals.total).toBe('12.5');
    pool.intercept({ path: '/mdu/api/v1/opd/receipt/find', method: 'POST' }).reply(200, { receipt: null, searchResult: false }, json);
    res = await ctx.app.inject({ method: 'POST', url: '/v1/ekasa/receipt', payload: { receiptId: 'O-NOPE1' } });
    expect(res.statusCode).toBe(404);
    res = await ctx.app.inject({ method: 'POST', url: '/v1/ekasa/receipt', payload: { receiptId: 'bad id!' } });
    expect(res.statusCode).toBe(400);
    res = await ctx.app.inject({ method: 'POST', url: '/v1/ekasa/receipt', payload: {} });
    expect(res.statusCode).toBe(400);
  });
});

describe('Peppol SML hash', () => {
  it('encodes base32 per RFC 4648', () => {
    expect(base32(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32(Buffer.from('f'))).toBe('MY');
    expect(base32(Buffer.from(''))).toBe('');
  });

  it('hashes the lowercase identifier value with SHA-256 for NAPTR and MD5 for the legacy CNAME', () => {
    const label = naptrLabel('0245:2020317068');
    expect(label).toMatch(/^[a-z2-7]{52}$/);
    expect(naptrLabel('0245:ABC')).toBe(naptrLabel('0245:abc'));
    expect(naptrName('0245:2020317068', ZONE)).toBe(`${label}.iso6523-actorid-upis.${ZONE}`);
    expect(legacyLabel('0088:5798000000001')).toBe('B-4c7e158a31c6dfa533dcfaf4b80fb205');
    expect(legacyName('0088:5798000000001', ZONE)).toBe(`B-4c7e158a31c6dfa533dcfaf4b80fb205.iso6523-actorid-upis.${ZONE}`);
  });

  it('reads the SMP URL from the NAPTR regexp', () => {
    expect(smpUrlFromNaptr([NAPTR_RECORD])).toBe('https://smp.example.test');
    expect(smpUrlFromNaptr([{ service: 'Meta:SMP', regexp: '"!^.*$!https://smp.other.test/!"' }])).toBe('https://smp.other.test');
    expect(smpUrlFromNaptr([{ service: 'Meta:OTHER', regexp: '!^.*$!https://x!' }, { service: 'Meta:SMP', regexp: 'garbage' }])).toBeNull();
    expect(smpUrlFromNaptr(undefined)).toBeNull();
  });

  it('looks up NAPTR first, then the legacy CNAME when enabled', async () => {
    const value = '0245:2020317068';
    const naptr = { [naptrName(value, ZONE)]: [NAPTR_RECORD] };
    expect(await createSmlLookup({ zone: ZONE, resolver: fakeResolver({ naptr }) })('0245', '2020317068')).toBe('https://smp.example.test');
    expect(await createSmlLookup({ zone: ZONE, resolver: fakeResolver() })('0245', '1')).toBeNull();
    const cname = { [legacyName('0245:1', ZONE)]: ['smp.legacy.test'] };
    expect(await createSmlLookup({ zone: ZONE, legacyCname: true, resolver: fakeResolver({ cname }) })('0245', '1')).toBe(`http://${legacyName('0245:1', ZONE)}`);
    expect(await createSmlLookup({ zone: ZONE, legacyCname: true, resolver: fakeResolver() })('0245', '2')).toBeNull();
    const servfail = Object.assign(new Error('SERVFAIL'), { code: 'ESERVFAIL' });
    await expect(createSmlLookup({ zone: ZONE, resolver: fakeResolver({ naptr: { [naptrName('0245:3', ZONE)]: servfail } }) })('0245', '3')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    await expect(createSmlLookup({ zone: ZONE, legacyCname: true, resolver: fakeResolver({ cname: { [legacyName('0245:3', ZONE)]: servfail } }) })('0245', '3')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });
});

describe('Peppol SMP', () => {
  it('parses document types from the ServiceGroup', () => {
    const types = parseServiceGroup(SMP_XML);
    expect(types).toHaveLength(2);
    expect(types[0]).toBe(INVOICE_DOCTYPE);
    expect(parseServiceGroup('<ServiceGroup/>')).toEqual([]);
    expect(parseServiceGroup('<ServiceMetadataReference href="https://x/services/%E0%A4%A"/>')).toEqual([]);
    expect(encodeParticipant('0245', '2020317068')).toBe('iso6523-actorid-upis%3A%3A0245%3A2020317068');
  });

  it('GET /v1/peppol/lookup answers registered, not registered and failures', async () => {
    const value = '0245:2020317068';
    const resolver = fakeResolver({ naptr: { [naptrName(value, ZONE)]: [NAPTR_RECORD], [naptrName('0245:404', ZONE)]: [NAPTR_RECORD], [naptrName('0245:500', ZONE)]: [NAPTR_RECORD] } });
    ctx = await createTestApp({ resolver });
    const pool = ctx.pool('https://smp.example.test');
    pool.intercept({ path: '/iso6523-actorid-upis%3A%3A0245%3A2020317068' }).reply(200, SMP_XML, { headers: { 'content-type': 'text/xml' } });
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/peppol/lookup/0245/2020317068' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ registered: true, documentTypes: [INVOICE_DOCTYPE, expect.stringContaining('CreditNote')] });
    res = await ctx.app.inject({ method: 'GET', url: '/v1/peppol/lookup/0245/2020317068' });
    expect(res.json().registered).toBe(true);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/peppol/lookup/0245/9999999999' });
    expect(res.json()).toMatchObject({ registered: false, documentTypes: [] });
    pool.intercept({ path: '/iso6523-actorid-upis%3A%3A0245%3A404' }).reply(404, '');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/peppol/lookup/0245/404' });
    expect(res.json()).toMatchObject({ registered: false });
    pool.intercept({ path: '/iso6523-actorid-upis%3A%3A0245%3A500' }).reply(500, '');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/peppol/lookup/0245/500' });
    expect(res.statusCode).toBe(502);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/peppol/lookup/24/x' });
    expect(res.statusCode).toBe(400);
  });

  it('refuses an SMP host that resolves to a private address', async () => {
    const resolver = fakeResolver({ naptr: { [naptrName('0245:1', ZONE)]: [NAPTR_RECORD] } });
    ctx = await createTestApp({ resolver, lookup: privateLookup });
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/peppol/lookup/0245/1' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('HOST_NOT_ALLOWED');
  });
});
