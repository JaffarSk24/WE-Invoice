import { describe, it, expect, afterEach } from 'vitest';
import { text } from 'node:stream/consumers';
import { createTestApp, captureLogs, privateLookup, PUBLIC_IP } from './helpers.js';
import { upstreamHeaders, upstreamPath, limitStream } from '../src/routes/proxy.js';

const ENV = { PROVIDER_BASE_URLS: JSON.stringify({ verteco: 'https://api.verteco.test/v1', 'verteco-sandbox': 'https://sandbox.verteco.test' }) };
let ctx;
afterEach(async () => { if (ctx) await ctx.app.close(); ctx = null; });

describe('proxy helpers', () => {
  it('moves X-Upstream-Authorization to Authorization and forwards a short allow-list of headers', () => {
    const h = upstreamHeaders({ 'x-upstream-authorization': 'Bearer t', 'content-type': 'application/json', cookie: 'x=1', host: 'gateway', 'x-peppol-participant-id': '0245:1' });
    expect(h).toEqual({ 'user-agent': 'WE-Invoice-gateway', 'content-type': 'application/json', 'x-peppol-participant-id': '0245:1', authorization: 'Bearer t' });
  });

  it('forwards the Idempotency-Key of a send so a retry is not delivered twice', () => {
    const h = upstreamHeaders({ 'x-upstream-authorization': 'Bearer t', 'content-type': 'application/json', 'idempotency-key': 'doc-1:2' });
    expect(h).toEqual({ 'user-agent': 'WE-Invoice-gateway', 'content-type': 'application/json', 'idempotency-key': 'doc-1:2', authorization: 'Bearer t' });
    expect(upstreamHeaders({ accept: 'application/json' })).not.toHaveProperty('idempotency-key');
  });

  it('keeps the raw path and query, refuses traversal', () => {
    expect(upstreamPath('/v1/proxy/peppol/verteco/document/receive/%2F1?x=1&y=%20', 'verteco')).toBe('document/receive/%2F1?x=1&y=%20');
    expect(() => upstreamPath('/v1/proxy/peppol/verteco/../admin', 'verteco')).toThrow();
    expect(() => upstreamPath('/v1/proxy/peppol/verteco/a/%2e%2e/b', 'verteco')).toThrow();
    expect(() => upstreamPath('/v1/proxy/peppol/verteco//etc', 'verteco')).toThrow();
  });

  it('limits a stream', async () => {
    const s = limitStream(3);
    const chunks = [];
    s.on('data', c => chunks.push(c));
    const done = new Promise((resolve, reject) => { s.on('end', resolve); s.on('error', reject); });
    s.write('ab');
    s.write('cd');
    s.end();
    await expect(done).rejects.toMatchObject({ code: 'BODY_TOO_LARGE' });
  });
});

describe('ANY /v1/proxy/peppol/{providerId}/{path}', () => {
  it('streams the request and answer, moves the authorization header and never caches', async () => {
    ctx = await createTestApp({ env: ENV });
    let upstreamRequest;
    ctx.pool('https://api.verteco.test').intercept({
      path: '/v1/document/send?x=1', method: 'POST',
      headers: { authorization: 'Bearer SECRET-TOKEN', 'x-peppol-participant-id': '0245:2020317068', 'idempotency-key': 'doc-1:1' }
    }).reply((options) => {
      upstreamRequest = options;
      return { statusCode: 201, data: '{"id":"doc-1","token":"RESPONSE-SECRET"}', responseOptions: { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=600', 'set-cookie': 'sid=1' } } };
    });
    const res = await ctx.app.inject({
      method: 'POST', url: '/v1/proxy/peppol/verteco/document/send?x=1',
      headers: { 'content-type': 'application/json', 'x-upstream-authorization': 'Bearer SECRET-TOKEN', 'x-peppol-participant-id': '0245:2020317068', 'idempotency-key': 'doc-1:1', cookie: 'a=b' },
      payload: '{"payload":"<Invoice/>"}'
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: 'doc-1', token: 'RESPONSE-SECRET' });
    expect(await text(upstreamRequest.body)).toBe('{"payload":"<Invoice/>"}');
    expect(upstreamRequest.headers.cookie).toBeUndefined();
    expect(upstreamRequest.headers['x-upstream-authorization']).toBeUndefined();
    expect(res.headers['content-type']).toBe('application/json');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['pragma']).toBe('no-cache');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(ctx.app.deps.cache.get('anything')).toBeUndefined();
    const rows = ctx.app.deps.stats.snapshot().routes;
    expect(JSON.stringify(rows)).not.toContain('document/send');
  });

  it('writes no secret, path or query into the logs, also when the provider fails', async () => {
    const logs = captureLogs();
    ctx = await createTestApp({ env: { ...ENV, LOG_LEVEL: 'trace' }, logger: { stream: logs.stream } });
    const pool = ctx.pool('https://api.verteco.test');
    pool.intercept({ path: '/v1/auth/token?client_secret=QUERY-SECRET', method: 'POST' }).reply(200, '{"token":"RESPONSE-SECRET"}', { headers: { 'content-type': 'application/json' } });
    pool.intercept({ path: '/v1/auth/token?client_secret=QUERY-SECRET', method: 'POST' }).reply(500, 'BODY-OF-ERROR SECRET');
    pool.intercept({ path: '/v1/auth/token?client_secret=QUERY-SECRET', method: 'POST' }).replyWithError(new Error('boom QUERY-SECRET'));
    const send = () => ctx.app.inject({
      method: 'POST', url: '/v1/proxy/peppol/verteco/auth/token?client_secret=QUERY-SECRET',
      headers: { 'content-type': 'application/json', 'x-upstream-authorization': 'Bearer HEADER-SECRET', 'x-upstream-base': 'https://BASE-SECRET.test', 'x-api-key': 'KEY-SECRET' },
      payload: '{"clientSecret":"BODY-SECRET"}'
    });
    expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(500);
    expect((await send()).statusCode).toBe(502);
    const text = logs.text();
    expect(logs.lines.length).toBeGreaterThan(0);
    for (const secret of ['HEADER-SECRET', 'BODY-SECRET', 'RESPONSE-SECRET', 'QUERY-SECRET', 'BASE-SECRET', 'KEY-SECRET', 'auth/token', 'client_secret']) {
      expect(text, secret).not.toContain(secret);
    }
    expect(text).toContain('/v1/proxy/peppol/:providerId/*');
  });

  it('forwards GET and DELETE without a body and keeps the upstream status', async () => {
    ctx = await createTestApp({ env: ENV });
    const pool = ctx.pool('https://api.verteco.test');
    pool.intercept({ path: '/v1/document/receive', method: 'GET' }).reply(200, '[]', { headers: { 'content-type': 'application/json', etag: '"e1"' } });
    pool.intercept({ path: '/v1/document/1', method: 'DELETE' }).reply(404, '{"error":"missing"}', { headers: { 'content-type': 'application/json' } });
    const get = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/verteco/document/receive' });
    expect(get.statusCode).toBe(200);
    expect(get.headers.etag).toBe('"e1"');
    const del = await ctx.app.inject({ method: 'DELETE', url: '/v1/proxy/peppol/verteco/document/1' });
    expect(del.statusCode).toBe(404);
    expect(del.json()).toEqual({ error: 'missing' });
  });

  it('uses the sandbox address for <id>-sandbox', async () => {
    ctx = await createTestApp({ env: ENV });
    ctx.pool('https://sandbox.verteco.test').intercept({ path: '/ping', method: 'GET' }).reply(200, 'pong');
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/verteco-sandbox/ping' });
    expect(res.body).toBe('pong');
  });

  it('refuses unknown providers, unconfigured providers and private hosts', async () => {
    ctx = await createTestApp({ env: ENV });
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/evil/x' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('HOST_NOT_ALLOWED');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/dativery/x' });
    expect(res.json().error.code).toBe('PROVIDER_NOT_CONFIGURED');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/BAD_ID/x' });
    expect(res.statusCode).toBe(400);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/sapi-sk/x', headers: { 'x-upstream-base': 'https://127.0.0.1/api' } });
    expect(res.json().error.code).toBe('HOST_NOT_ALLOWED');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/sapi-sk/x', headers: { 'x-upstream-base': 'http://api.p.test' } });
    expect(res.json().error.code).toBe('HOST_NOT_ALLOWED');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/sapi-sk/x' });
    expect(res.json().error.code).toBe('BAD_REQUEST');
    // The router normalises ".." away before the handler; nothing is proxied.
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/verteco/../x' });
    expect(res.statusCode).toBe(404);
  });

  it('refuses a provider host that resolves to a private address', async () => {
    ctx = await createTestApp({ env: ENV, lookup: privateLookup });
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/verteco/x' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('HOST_NOT_ALLOWED');
  });

  it('proxies a custom SAPI-SK base after the checks', async () => {
    ctx = await createTestApp({ env: ENV, lookup: async () => [{ address: PUBLIC_IP, family: 4 }] });
    ctx.pool('https://api.provider.test').intercept({ path: '/sapi/v1/auth/token', method: 'POST' }).reply(200, '{"jwt":"x"}', { headers: { 'content-type': 'application/json' } });
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/proxy/peppol/sapi-sk/auth/token', headers: { 'x-upstream-base': 'https://api.provider.test/sapi/v1/', 'content-type': 'application/json' }, payload: '{}' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ jwt: 'x' });
  });

  it('limits the body to 15 MB', async () => {
    ctx = await createTestApp({ env: ENV });
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/proxy/peppol/verteco/document/send', headers: { 'content-type': 'application/json', 'content-length': String(16 * 1024 * 1024) }, payload: '{}' });
    expect(res.statusCode).toBe(413);
    expect(res.json().error.code).toBe('BODY_TOO_LARGE');
  });

  it('answers 502 when the provider is down and follows same-host redirects only', async () => {
    ctx = await createTestApp({ env: ENV });
    const pool = ctx.pool('https://api.verteco.test');
    pool.intercept({ path: '/v1/down', method: 'GET' }).replyWithError(new Error('ECONNREFUSED'));
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/verteco/down' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Provider unavailable' } });
    pool.intercept({ path: '/v1/moved', method: 'GET' }).reply(302, '', { headers: { location: '/v1/target' } });
    pool.intercept({ path: '/v1/target', method: 'GET' }).reply(200, 'there');
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/verteco/moved' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('there');
    pool.intercept({ path: '/v1/elsewhere', method: 'GET' }).reply(302, '', { headers: { location: 'https://evil.test/x' } });
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/verteco/elsewhere' });
    expect(res.statusCode).toBe(502);
    pool.intercept({ path: '/v1/post-moved', method: 'POST' }).reply(307, '', { headers: { location: '/v1/x' } });
    res = await ctx.app.inject({ method: 'POST', url: '/v1/proxy/peppol/verteco/post-moved', headers: { 'content-type': 'text/plain' }, payload: 'x' });
    expect(res.statusCode).toBe(502);
    for (let i = 0; i < 5; i++) pool.intercept({ path: `/v1/loop${i}`, method: 'GET' }).reply(302, '', { headers: { location: `/v1/loop${i + 1}` } });
    res = await ctx.app.inject({ method: 'GET', url: '/v1/proxy/peppol/verteco/loop0' });
    expect(res.statusCode).toBe(502);
  });
});
