// Contract test: every implemented route answers a body that validates
// against its schema in openapi.yaml, success and error alike.
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { createTestApp, json, fakeResolver } from './helpers.js';
import { RPO_ENTITY, ARES_ENTITY, VIES_VALID, ECB_XML, EKASA_RECEIPT, SMP_XML, FS_TAX_SUBJECTS, FS_LIST, NAPTR_RECORD } from './fixtures.js';
import { naptrName } from '../src/upstream/peppol-sml.js';

const spec = parse(readFileSync(new URL('../openapi.yaml', import.meta.url), 'utf8'));
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(spec, 'openapi');

const pointer = (s) => s.replace(/~/g, '~0').replace(/\//g, '~1');
function validator(path, method, status, mediaType = 'application/json') {
  const ref = `openapi#/paths/${pointer(path)}/${method}/responses/${status}/content/${pointer(mediaType)}/schema`;
  const schema = spec.paths[path][method].responses[status].content[mediaType].schema;
  return schema.$ref ? ajv.getSchema(`openapi${schema.$ref}`) : ajv.getSchema(ref);
}
const errorValidator = ajv.getSchema('openapi#/components/schemas/Error');

let ctx;
beforeAll(async () => {
  const resolver = fakeResolver({ naptr: { [naptrName('0245:2020317068', 'edelivery.tech.ec.europa.eu')]: [NAPTR_RECORD] } });
  ctx = await createTestApp({ env: { FS_OPENDATA_API_KEY: 'k', ADMIN_TOKEN: 'admin', BETA_HMAC_SECRET: 's', PROVIDER_BASE_URLS: '{"verteco":"https://api.verteco.test"}' }, resolver });
  ctx.pool('https://api.statistics.sk').intercept({ path: '/rpo/v1/search?identifier=35763469' }).reply(200, { results: [RPO_ENTITY] }, json);
  ctx.pool('https://api.statistics.sk').intercept({ path: '/rpo/v1/search?fullName=Example' }).reply(200, { results: [RPO_ENTITY] }, json);
  ctx.pool('https://iz.opendata.financnasprava.sk').intercept({ path: /ds_dic/ }).reply(200, FS_TAX_SUBJECTS, json);
  ctx.pool('https://iz.opendata.financnasprava.sk').intercept({ path: /ds_dph/ }).reply(200, FS_LIST('SK2020317068'), json).times(3);
  ctx.pool('https://ares.gov.cz').intercept({ path: /27074358/ }).reply(200, ARES_ENTITY, json);
  ctx.pool('https://ec.europa.eu').intercept({ path: /vat\/2020317068/ }).reply(200, VIES_VALID, json);
  ctx.pool('https://www.ecb.europa.eu').intercept({ path: /eurofxref/ }).reply(200, ECB_XML);
  ctx.pool('https://ekasa.financnasprava.sk').intercept({ path: /receipt/, method: 'POST' }).reply(200, EKASA_RECEIPT, json);
  ctx.pool('https://smp.example.test').intercept({ path: /0245/ }).reply(200, SMP_XML);
  ctx.pool('https://api.verteco.test').intercept({ path: '/x' }).replyWithError(new Error('down'));
});
afterAll(async () => { await ctx.app.close(); });

const CASES = [
  ['/v1/health', 'get', '200', { url: '/v1/health' }],
  ['/v1/company/sk/{ico}', 'get', '200', { url: '/v1/company/sk/35763469' }],
  ['/v1/company/sk/search', 'get', '200', { url: '/v1/company/sk/search?q=Example' }],
  ['/v1/company/cz/{ico}', 'get', '200', { url: '/v1/company/cz/27074358' }],
  ['/v1/vat/vies/{cc}/{number}', 'get', '200', { url: '/v1/vat/vies/SK/2020317068' }],
  ['/v1/vat/sk/{icdph}/reliability', 'get', '200', { url: '/v1/vat/sk/SK2020317068/reliability' }],
  ['/v1/rates/ecb', 'get', '200', { url: '/v1/rates/ecb?date=2026-10-17' }],
  ['/v1/ekasa/receipt', 'post', '200', { method: 'POST', url: '/v1/ekasa/receipt', payload: { receiptId: 'O-1234567890ABCDEF1234567890ABCDEF' } }],
  ['/v1/peppol/lookup/{scheme}/{id}', 'get', '200', { url: '/v1/peppol/lookup/0245/2020317068' }],
  ['/v1/waitlist', 'post', '202', { method: 'POST', url: '/v1/waitlist', payload: { email: 'c@d.sk', lang: 'uk', consent: true, startedAt: 1 } }],
  ['/v1/beta/redeem', 'post', '200', { method: 'POST', url: '/v1/beta/redeem', payload: { code: 'CODE' } }],
  ['/v1/admin/stats', 'get', '200', { url: '/v1/admin/stats', headers: { authorization: 'Bearer admin' } }]
];

describe('responses match openapi.yaml', () => {
  it.each(CASES)('%s %s %s', async (path, method, status, request) => {
    if (path === '/v1/beta/redeem') request.payload.code = ctx.app.deps.invites.create();
    const res = await ctx.app.inject({ method: 'GET', ...request });
    expect(res.statusCode).toBe(Number(status));
    const validate = validator(path, method, status);
    expect(validate(res.json()), JSON.stringify(validate.errors)).toBe(true);
  });

  it('the CSV export is text/csv', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/admin/waitlist.csv', headers: { authorization: 'Bearer admin' } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
  });

  it.each([
    ['/v1/company/sk/x'], ['/v1/nope'], ['/v1/admin/stats'], ['/v1/proxy/peppol/nope/x'], ['/v1/proxy/peppol/verteco/x'], ['/v1/proxy/superfaktura/de/x'], ['/v1/proxy/superfaktura/sk/a%5cb'], ['/v1/waitlist/confirm?token=bad'], ['/v1/rates/ecb?date=3000-01-01']
  ])('error of %s has the Error shape', async (url) => {
    const res = await ctx.app.inject({ method: 'GET', url });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(errorValidator(res.json()), JSON.stringify(errorValidator.errors)).toBe(true);
  });
});
