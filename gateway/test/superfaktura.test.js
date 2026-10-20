import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp, captureLogs, privateLookup } from './helpers.js';
import { sfUpstreamUrl, sfUpstreamHeaders } from '../src/routes/superfaktura.js';
import { SF_MARKETS } from '../src/upstream/superfaktura-markets.js';
import { SF_MARKETS as CORE_SF_MARKETS } from '../../packages/core/imports/superfaktura-markets.js';

const AUTH = 'SFAPI email=jana%40example.sk&apikey=SF-SECRET-KEY&company_id=42';
const LIST = '/invoices/index.json/listinfo:1/page:1/per_page:100';
let ctx;
afterEach(async () => { if (ctx) await ctx.app.close(); ctx = null; });

describe('SuperFaktura markets', () => {
  it('match the table of the client in packages/core', () => {
    expect(SF_MARKETS).toEqual(CORE_SF_MARKETS);
  });
});

describe('SuperFaktura proxy helpers', () => {
  it('builds the upstream URL from the market and the raw path', () => {
    expect(sfUpstreamUrl('sk', `/v1/proxy/superfaktura/sk${LIST}`)).toBe(`https://moja.superfaktura.sk${LIST}`);
    expect(sfUpstreamUrl('cz', '/v1/proxy/superfaktura/cz/invoices/getInvoiceDetails/1,2,3')).toBe('https://moje.superfaktura.cz/invoices/getInvoiceDetails/1,2,3');
    expect(sfUpstreamUrl('at', '/v1/proxy/superfaktura/at/clients/index.json?x=1&y=a:b')).toBe('https://meine.superfaktura.at/clients/index.json?x=1&y=a:b');
  });

  it('refuses unknown markets and paths that could leave the API', () => {
    for (const market of ['de', 'SK', 'constructor', '__proto__', 'toString']) {
      expect(() => sfUpstreamUrl(market, `/v1/proxy/superfaktura/${market}/x`), market).toThrow(expect.objectContaining({ statusCode: 400, code: 'HOST_NOT_ALLOWED' }));
    }
    const bad = ['../admin', 'a/../../x', 'a/%2e%2e/x', 'a/.%2E/x', 'a%2f..%2fx', 'a%5c..', 'a\\b', '/etc', 'a//b', 'a/./b', 'x?q=%2f', 'x@evil.test', 'a b'];
    for (const rest of bad) {
      expect(() => sfUpstreamUrl('sk', `/v1/proxy/superfaktura/sk/${rest}`), rest).toThrow(expect.objectContaining({ statusCode: 400 }));
    }
    expect(() => sfUpstreamUrl('sk', '/other/path')).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('forwards only the credential, as Authorization', () => {
    expect(sfUpstreamHeaders({ 'x-upstream-authorization': AUTH, cookie: 'a=b', authorization: 'Bearer other', host: 'gw' }))
      .toEqual({ 'user-agent': 'WE-Invoice-gateway', accept: 'application/json', authorization: AUTH });
    expect(sfUpstreamHeaders({})).not.toHaveProperty('authorization');
  });
});

describe('GET /v1/proxy/superfaktura/{market}/{path}', () => {
  it('proxies the GET with the credential, answers as is and never caches', async () => {
    ctx = await createTestApp();
    let upstreamHeaders;
    ctx.pool('https://moja.superfaktura.sk').intercept({ path: LIST, method: 'GET', headers: { authorization: AUTH } }).reply((options) => {
      upstreamHeaders = options.headers;
      return { statusCode: 200, data: '{"itemCount":1,"pageCount":1,"items":[{"Invoice":{"id":"7"}}]}', responseOptions: { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=600', 'set-cookie': 'SFSESSION=1' } } };
    });
    const res = await ctx.app.inject({ method: 'GET', url: `/v1/proxy/superfaktura/sk${LIST}`, headers: { accept: 'application/json', 'x-upstream-authorization': AUTH, cookie: 'a=b', origin: 'https://jaffarsk24.github.io' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ itemCount: 1, pageCount: 1, items: [{ Invoice: { id: '7' } }] });
    expect(res.headers['content-type']).toBe('application/json');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers.pragma).toBe('no-cache');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).toBe('https://jaffarsk24.github.io');
    expect(upstreamHeaders.cookie).toBeUndefined();
    expect(upstreamHeaders['x-upstream-authorization']).toBeUndefined();
    expect(ctx.agent.pendingInterceptors()).toEqual([]);
  });

  it('passes the upstream errors and Retry-After through', async () => {
    ctx = await createTestApp();
    const pool = ctx.pool('https://moje.superfaktura.cz');
    pool.intercept({ path: '/clients/index.json', method: 'GET' }).reply(401, '{"error":1,"message":"Unauthorized"}', { headers: { 'content-type': 'application/json' } });
    pool.intercept({ path: '/clients/index.json', method: 'GET' }).reply(429, '{"error":1}', { headers: { 'content-type': 'application/json', 'retry-after': '5' } });
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/superfaktura/cz/clients/index.json', headers: { 'x-upstream-authorization': AUTH } });
    expect(res.statusCode).toBe(401);
    expect(res.headers['cache-control']).toBe('no-store');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/superfaktura/cz/clients/index.json', headers: { 'x-upstream-authorization': AUTH } });
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('5');
  });

  it('answers 400 for an unknown market and a path that leaves the API', async () => {
    ctx = await createTestApp();
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/superfaktura/de/invoices/index.json', headers: { 'x-upstream-authorization': AUTH } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('HOST_NOT_ALLOWED');
    // Encoded dots are covered by the helper test above: the injected
    // request is already normalised by the URL parser before routing.
    for (const rest of ['a%2f..%2f..%2fx', 'a%5c..%5cx', 'invoices/x%40evil.test']) {
      res = await ctx.app.inject({ method: 'GET', url: `/v1/proxy/superfaktura/sk/${rest}`, headers: { 'x-upstream-authorization': AUTH } });
      expect(res.statusCode, rest).toBe(400);
      expect(res.json().error.code).toBe('BAD_REQUEST');
    }
    // The router itself drops plain ".." before the handler; nothing is proxied.
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/superfaktura/sk/../../v1/admin/stats' });
    expect([400, 404]).toContain(res.statusCode);
    expect(ctx.agent.pendingInterceptors()).toEqual([]);
  });

  it.each(['POST', 'PUT', 'DELETE', 'PATCH'])('refuses %s with 405', async (method) => {
    ctx = await createTestApp();
    const res = await ctx.app.inject({ method, url: '/v1/proxy/superfaktura/sk/invoices/add.json', headers: { 'x-upstream-authorization': AUTH, 'content-type': 'application/json' }, payload: '{"Invoice":{}}' });
    expect(res.statusCode).toBe(405);
    expect(res.json().error.code).toBe('METHOD_NOT_ALLOWED');
    expect(res.headers.allow).toBe('GET');
  });

  it('answers 502 when SuperFaktura is down or redirects to another host', async () => {
    ctx = await createTestApp();
    const pool = ctx.pool('https://moja.superfaktura.sk');
    pool.intercept({ path: '/down', method: 'GET' }).replyWithError(new Error('ECONNRESET'));
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/superfaktura/sk/down' });
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('UPSTREAM_UNAVAILABLE');
    pool.intercept({ path: '/moved', method: 'GET' }).reply(302, '', { headers: { location: 'https://evil.test/steal' } });
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/superfaktura/sk/moved' });
    expect(res.statusCode).toBe(502);
    pool.intercept({ path: '/old', method: 'GET' }).reply(301, '', { headers: { location: '/new' } });
    pool.intercept({ path: '/new', method: 'GET' }).reply(200, '{"ok":1}', { headers: { 'content-type': 'application/json' } });
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/superfaktura/sk/old' });
    expect(res.statusCode).toBe(200);
  });

  it('refuses a SuperFaktura host that resolves to a private address', async () => {
    ctx = await createTestApp({ lookup: privateLookup });
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/superfaktura/sk/clients/index.json' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('HOST_NOT_ALLOWED');
  });

  it('writes no credential, path, query or body into the logs and stats', async () => {
    const logs = captureLogs();
    ctx = await createTestApp({ env: { LOG_LEVEL: 'trace' }, logger: { stream: logs.stream } });
    const pool = ctx.pool('https://moja.superfaktura.sk');
    const path = '/clients/index.json/listinfo:1/search:SEARCH-SECRET?q=QUERY-SECRET';
    pool.intercept({ path, method: 'GET' }).reply(200, '{"client":"BODY-SECRET"}', { headers: { 'content-type': 'application/json' } });
    pool.intercept({ path, method: 'GET' }).reply(500, 'ERROR-SECRET');
    pool.intercept({ path, method: 'GET' }).replyWithError(new Error('boom SEARCH-SECRET'));
    const send = (method = 'GET') => ctx.app.inject({ method, url: `/v1/proxy/superfaktura/sk${path}`, headers: { 'x-upstream-authorization': AUTH, 'content-type': 'application/json' }, payload: method === 'GET' ? undefined : '{"x":"POST-SECRET"}' });
    expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(500);
    expect((await send()).statusCode).toBe(502);
    expect((await send('POST')).statusCode).toBe(405);
    const text = logs.text();
    expect(logs.lines.length).toBeGreaterThan(0);
    for (const secret of ['SF-SECRET-KEY', 'jana', 'SFAPI', 'SEARCH-SECRET', 'QUERY-SECRET', 'BODY-SECRET', 'ERROR-SECRET', 'POST-SECRET', 'clients/index']) {
      expect(text, secret).not.toContain(secret);
    }
    expect(text).toContain('/v1/proxy/superfaktura/:market/*');
    expect(JSON.stringify(ctx.app.deps.stats.snapshot())).not.toMatch(/SECRET|clients\/index/);
  });

  it('lets the web app send the credential header across origins', async () => {
    ctx = await createTestApp();
    const res = await ctx.app.inject({ method: 'OPTIONS', url: `/v1/proxy/superfaktura/sk${LIST}`, headers: { origin: 'https://jaffarsk24.github.io', 'access-control-request-method': 'GET', 'access-control-request-headers': 'accept,x-upstream-authorization' } });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://jaffarsk24.github.io');
    expect(res.headers['access-control-allow-headers']).toMatch(/X-Upstream-Authorization/i);
    const evil = await ctx.app.inject({ method: 'OPTIONS', url: `/v1/proxy/superfaktura/sk${LIST}`, headers: { origin: 'https://evil.test', 'access-control-request-method': 'GET' } });
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('applies its own rate limit of 60 a minute', async () => {
    ctx = await createTestApp({ env: { RATE_LIMIT_SCALE: '1' } });
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/superfaktura/de/x' });
    expect(res.headers['x-ratelimit-limit']).toBe('60');
  });
});
