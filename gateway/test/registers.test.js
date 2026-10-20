import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, json } from './helpers.js';
import { RPO_ENTITY, ARES_ENTITY, VIES_VALID, FS_TAX_SUBJECTS, FS_VAT_PAYERS, FS_LIST, FS_NOT_FOUND } from './fixtures.js';
import { mapRpoEntity, currentValue } from '../src/upstream/rpo.js';
import { mapAresEntity } from '../src/upstream/ares.js';
import { mapViesAnswer } from '../src/upstream/vies.js';
import { pickField } from '../src/upstream/fs-opendata.js';
import { mapLegalForm } from '../src/upstream/legal-form.js';

const RPO = 'https://api.statistics.sk';
const FS = 'https://iz.opendata.financnasprava.sk';
let ctx;
afterEach(async () => { if (ctx) await ctx.app.close(); ctx = null; });

describe('mappers', () => {
  it('maps an RPO entity with the current values', () => {
    const c = mapRpoEntity(RPO_ENTITY, '2026-10-18T00:00:00.000Z');
    expect(c).toEqual({
      name: 'Example s. r. o.', ico: '35763469', dic: null, icDph: null, legalForm: 'SRO', legalFormText: 'Spoločnosť s ručením obmedzeným', registerEntry: null, country: 'SK',
      address: { street: 'Hlavná 12/345', city: 'Bratislava', zip: '811 01', country: 'SK' }, source: 'RPO', checkedAt: '2026-10-18T00:00:00.000Z'
    });
    expect(mapRpoEntity(null)).toBeNull();
    expect(mapRpoEntity({ fullNames: [] })).toBeNull();
    expect(mapRpoEntity({ fullNames: [{ value: 'X' }], legalForms: [{ value: '101' }], addresses: [{ postalCode: '01001' }] })).toMatchObject({ legalForm: null, address: { zip: '010 01', street: null } });
    expect(currentValue([{ value: 'a', validFrom: '2000-01-01', validTo: '2001-01-01' }, { value: 'b', validFrom: '2001-01-01', validTo: '2002-01-01' }])).toMatchObject({ value: 'b' });
    expect(currentValue([])).toBeUndefined();
  });

  it('maps an ARES entity', () => {
    const c = mapAresEntity(ARES_ENTITY, '2026-10-18T00:00:00.000Z');
    expect(c).toMatchObject({ name: 'Alza.cz a.s.', ico: '27074358', dic: 'CZ27074358', icDph: 'CZ27074358', legalForm: 'AS', country: 'CZ', address: { street: 'Jankovcova 1522/53', city: 'Praha', zip: '170 00', country: 'CZ' }, source: 'ARES' });
    expect(mapAresEntity({ obchodniJmeno: 'X', sidlo: { textovaAdresa: 'Somewhere 1' }, pravniFormaText: 'Spolek', pravniForma: '701', spisovaZnacka: 'C 1' })).toMatchObject({ address: { street: 'Somewhere 1' }, legalForm: 'NGO', legalFormText: 'Spolek', registerEntry: 'C 1', dic: null, icDph: null });
    expect(mapAresEntity({})).toBeNull();
  });

  it('maps a VIES answer and treats member state outages as upstream failures', () => {
    expect(mapViesAnswer(VIES_VALID, 't')).toEqual({ valid: true, name: 'EXAMPLE s. r. o.', address: 'Hlavná 1 811 01 Bratislava', checkedAt: 't' });
    expect(mapViesAnswer({ isValid: false, name: '---', address: '---', userError: 'INVALID' }, 't')).toEqual({ valid: false, name: null, address: null, checkedAt: 't' });
    expect(() => mapViesAnswer({ userError: 'MS_UNAVAILABLE' })).toThrow(expect.objectContaining({ code: 'UPSTREAM_UNAVAILABLE' }));
    expect(() => mapViesAnswer({ userError: 'INVALID_INPUT' })).toThrow(expect.objectContaining({ code: 'UPSTREAM_UNAVAILABLE' }));
  });

  it('finds fields by loose names and maps legal forms', () => {
    expect(pickField({ 'IČ DPH': ' SK1 ' }, 'ic_dph', 'IČ DPH')).toBe('SK1');
    expect(pickField({ x: 1 }, 'y')).toBeNull();
    expect(pickField(null, 'y')).toBeNull();
    expect(mapLegalForm(112)).toBe('SRO');
    expect(mapLegalForm('121')).toBe('AS');
    expect(mapLegalForm('117')).toBe('NGO');
    expect(mapLegalForm('101')).toBe('FO_ZIVNOST');
    expect(mapLegalForm('205')).toBe('OTHER');
    expect(mapLegalForm(null)).toBeNull();
  });
});

describe('GET /v1/company/sk/{ico}', () => {
  it('combines RPO and FS open data and caches the answer', async () => {
    ctx = await createTestApp({ env: { FS_OPENDATA_API_KEY: 'k' } });
    ctx.pool(RPO).intercept({ path: '/rpo/v1/search?identifier=35763469' }).reply(200, { results: [RPO_ENTITY] }, json);
    ctx.pool(FS).intercept({ path: '/api/data/ds_dsrdp/search?page=1&column=ico&search=35763469', headers: { key: 'k' } }).reply(200, FS_TAX_SUBJECTS, json);
    ctx.pool(FS).intercept({ path: '/api/data/ds_dphs/search?page=1&column=ico&search=35763469', headers: { key: 'k' } }).reply(200, FS_VAT_PAYERS, json);
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/company/sk/35763469' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Example s. r. o.', dic: '2020317068', icDph: 'SK2020317068', source: 'RPO' });
    res = await ctx.app.inject({ method: 'GET', url: '/v1/company/sk/35763469' });
    expect(res.statusCode).toBe(200);
    expect(ctx.agent.pendingInterceptors()).toEqual([]);
  });

  it('answers without DIČ when the FS key is missing or FS fails', async () => {
    ctx = await createTestApp();
    ctx.pool(RPO).intercept({ path: '/rpo/v1/search?identifier=35763469' }).reply(200, { results: [RPO_ENTITY] }, json);
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/company/sk/35763469' });
    expect(res.json()).toMatchObject({ dic: null, icDph: null });
    await ctx.app.close();
    ctx = await createTestApp({ env: { FS_OPENDATA_API_KEY: 'k' } });
    ctx.pool(RPO).intercept({ path: '/rpo/v1/search?identifier=35763469' }).reply(200, { results: [RPO_ENTITY] }, json);
    ctx.pool(FS).intercept({ path: /ds_dsrdp/ }).reply(500, 'x');
    ctx.pool(FS).intercept({ path: /ds_dphs/ }).reply(500, 'x');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/company/sk/35763469' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Example s. r. o.', dic: null });
  });

  it('answers 404, 400 and 502', async () => {
    ctx = await createTestApp();
    ctx.pool(RPO).intercept({ path: '/rpo/v1/search?identifier=11111111' }).reply(200, { results: [] }, json);
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/company/sk/11111111' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/company/sk/abc' });
    expect(res.statusCode).toBe(400);
    ctx.pool(RPO).intercept({ path: '/rpo/v1/search?identifier=22222222' }).reply(503, '');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/company/sk/22222222' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
  });
});

describe('GET /v1/company/sk/search', () => {
  it('searches by name', async () => {
    ctx = await createTestApp();
    ctx.pool(RPO).intercept({ path: '/rpo/v1/search?fullName=Example' }).reply(200, { results: [RPO_ENTITY, { fullNames: [] }] }, json);
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/company/sk/search?q=Example' });
    expect(res.statusCode).toBe(200);
    expect(res.json().results).toHaveLength(1);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/company/sk/search?q=ab' });
    expect(res.statusCode).toBe(400);
    ctx.pool(RPO).intercept({ path: '/rpo/v1/search?fullName=Nothing' }).reply(200, {}, json);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/company/sk/search?q=Nothing' });
    expect(res.json()).toEqual({ results: [] });
  });
});

describe('GET /v1/company/cz/{ico}', () => {
  it('maps ARES and answers 404 for an unknown IČO', async () => {
    ctx = await createTestApp();
    const pool = ctx.pool('https://ares.gov.cz');
    pool.intercept({ path: '/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/27074358' }).reply(200, ARES_ENTITY, json);
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/company/cz/27074358' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'Alza.cz a.s.', country: 'CZ', source: 'ARES' });
    pool.intercept({ path: '/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/00000001' }).reply(404, { kod: 'NENALEZENO' }, json);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/company/cz/00000001' });
    expect(res.statusCode).toBe(404);
    pool.intercept({ path: '/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/00000002' }).reply(502, '');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/company/cz/00000002' });
    expect(res.statusCode).toBe(502);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/company/cz/123' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /v1/vat/vies/{cc}/{number}', () => {
  it('checks a VAT number', async () => {
    ctx = await createTestApp();
    ctx.pool('https://ec.europa.eu').intercept({ path: '/taxation_customs/vies/rest-api/ms/SK/vat/2020317068' }).reply(200, VIES_VALID, json);
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/vat/vies/SK/2020317068' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ valid: true, name: 'EXAMPLE s. r. o.' });
    ctx.pool('https://ec.europa.eu').intercept({ path: '/taxation_customs/vies/rest-api/ms/DE/vat/123456789' }).reply(200, { isValid: false, userError: 'MS_UNAVAILABLE' }, json);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/vat/vies/DE/123456789' });
    expect(res.statusCode).toBe(502);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/vat/vies/sk/1' });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /v1/vat/sk/{icdph}/reliability', () => {
  it('reads the three FS lists', async () => {
    ctx = await createTestApp({ env: { FS_OPENDATA_API_KEY: 'k' } });
    const pool = ctx.pool(FS);
    const q = (list, hit) => pool.intercept({ path: `/api/data/${list}/search?page=1&column=ic_dph&search=SK2020317068` }).reply(200, FS_LIST(hit ? 'SK2020317068' : null), json);
    q('ds_dphv', false); q('ds_dphz', false); q('ds_dphs', true);
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/vat/sk/SK2020317068/reliability' });
    expect(res.json()).toMatchObject({ status: 'OK', lists: ['vat-payers'] });
    res = await ctx.app.inject({ method: 'GET', url: '/v1/vat/sk/SK2020317068/reliability' });
    expect(res.json().status).toBe('OK');
    await ctx.app.close();
    ctx = await createTestApp({ env: { FS_OPENDATA_API_KEY: 'k' } });
    const p2 = ctx.pool(FS);
    const q2 = (list, hit) => p2.intercept({ path: `/api/data/${list}/search?page=1&column=ic_dph&search=SK2020317069` }).reply(200, FS_LIST(hit ? 'SK2020317069' : null), json);
    q2('ds_dphv', false); q2('ds_dphz', true); q2('ds_dphs', true);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/vat/sk/SK2020317069/reliability' });
    expect(res.json()).toMatchObject({ status: 'REASONS_FOR_CANCELLATION', lists: ['cancellation-reasons', 'vat-payers'] });
    const q3 = (list, hit) => p2.intercept({ path: `/api/data/${list}/search?page=1&column=ic_dph&search=SK2020317070` }).reply(200, hit ? [{ IC_DPH: 'SK2020317070' }] : { items: [] }, json);
    q3('ds_dphv', true); q3('ds_dphz', false); q3('ds_dphs', false);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/vat/sk/SK2020317070/reliability' });
    expect(res.json()).toMatchObject({ status: 'DELETED', lists: ['deleted'] });
    const q4 = (list) => p2.intercept({ path: `/api/data/${list}/search?page=1&column=ic_dph&search=SK2020317071` }).reply(404, FS_NOT_FOUND, json);
    q4('ds_dphv'); q4('ds_dphz'); q4('ds_dphs');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/vat/sk/SK2020317071/reliability' });
    expect(res.json()).toMatchObject({ status: 'NOT_REGISTERED', lists: [] });
  });

  it('answers 503 NOT_CONFIGURED without the FS key', async () => {
    ctx = await createTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/vat/sk/SK2020317068/reliability' });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('NOT_CONFIGURED');
  });
});
