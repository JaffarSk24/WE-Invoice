// The owner's counters behind the admin token, the security headers and
// CORS of every answer, and the retired waiting list routes.
import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp } from './helpers.js';
import { safeEqual } from '../src/routes/admin.js';

let ctx;
afterEach(async () => { if (ctx) await ctx.app.close(); ctx = null; });

describe('admin endpoints', () => {
  it('require the bearer token', async () => {
    ctx = await createTestApp({ env: { ADMIN_TOKEN: 'owner-token' } });
    for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: 'Basic x' }]) {
      const res = await ctx.app.inject({ method: 'GET', url: '/v1/admin/stats', headers });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    }
    await ctx.app.close();
    ctx = await createTestApp();
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/admin/stats', headers: { authorization: 'Bearer ' } });
    expect(res.statusCode).toBe(401);
  });

  it('answer the counters as JSON', async () => {
    ctx = await createTestApp({ env: { ADMIN_TOKEN: 'owner-token' } });
    await ctx.app.inject({ method: 'GET', url: '/v1/health' });
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/admin/stats', headers: { authorization: 'Bearer owner-token' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ totals: { requests: expect.any(Number) } });
    expect(res.json().waitlist).toBeUndefined();
  });

  it('compare tokens in constant time and refuse empty ones', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
});

describe('the waiting list', () => {
  it('is gone, with its invitation codes', async () => {
    ctx = await createTestApp({ env: { ADMIN_TOKEN: 'owner-token' } });
    const auth = { authorization: 'Bearer owner-token' };
    for (const [method, url] of [['POST', '/v1/waitlist'], ['GET', '/v1/waitlist/confirm?token=x'], ['GET', '/v1/waitlist/unsubscribe?token=x'], ['POST', '/v1/beta/redeem'], ['GET', '/v1/admin/waitlist.csv']]) {
      const res = await ctx.app.inject({ method, url, headers: auth, ...(method === 'POST' ? { payload: {} } : {}) });
      expect(res.statusCode, url).toBe(404);
    }
  });
});

describe('GET /v1/health', () => {
  it('reports degraded when an upstream failed recently', async () => {
    ctx = await createTestApp();
    ctx.pool('https://api.statistics.sk').intercept({ path: '/rpo/v1/search?identifier=12345678' }).reply(500, '');
    await ctx.app.inject({ method: 'GET', url: '/v1/company/sk/12345678' });
    const res = await ctx.app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.json()).toMatchObject({ status: 'degraded', upstreams: { rpo: 'down' } });
    expect(res.headers['strict-transport-security']).toContain('max-age');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('allows the site origin only', async () => {
    ctx = await createTestApp();
    let res = await ctx.app.inject({ method: 'OPTIONS', url: '/v1/health', headers: { origin: 'https://jaffarsk24.github.io', 'access-control-request-method': 'GET' } });
    expect(res.headers['access-control-allow-origin']).toBe('https://jaffarsk24.github.io');
    expect(res.headers['access-control-allow-headers']).toContain('X-Upstream-Authorization');
    res = await ctx.app.inject({ method: 'OPTIONS', url: '/v1/health', headers: { origin: 'https://evil.test', 'access-control-request-method': 'GET' } });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
