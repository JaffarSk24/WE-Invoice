import { describe, it, expect, afterEach } from 'vitest';
import { createTestApp } from './helpers.js';
import { inviteCode, normalizeCode, signBetaToken, verifyBetaToken, safeEqual } from '../src/waitlist/tokens.js';
import { toCsv } from '../src/routes/admin.js';

let ctx;
afterEach(async () => { if (ctx) await ctx.app.close(); ctx = null; });

describe('tokens', () => {
  it('generates readable invite codes and normalises input', () => {
    const code = inviteCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
    expect(normalizeCode(' abcd efgh jklm ')).toBe('ABCD-EFGH-JKLM');
    expect(normalizeCode('abc')).toBe('ABC');
  });

  it('signs and verifies beta tokens', () => {
    const token = signBetaToken('s', { code: 'A', expiresAt: '2099-01-01T00:00:00.000Z' });
    expect(verifyBetaToken('s', token)).toMatchObject({ v: 1, code: 'A' });
    expect(verifyBetaToken('other', token)).toBeNull();
    expect(verifyBetaToken('s', `${token}x`)).toBeNull();
    expect(verifyBetaToken('s', 'a.b.c')).toBeNull();
    expect(verifyBetaToken('s', signBetaToken('s', { code: 'A', expiresAt: '2000-01-01T00:00:00.000Z' }))).toBeNull();
    expect(verifyBetaToken('', token)).toBeNull();
    expect(verifyBetaToken('s', 42)).toBeNull();
    const payload = Buffer.from('not json').toString('base64url');
    const bad = `${payload}.${signBetaToken('s', { code: 'A', expiresAt: 'x' }).split('.')[1]}`;
    expect(verifyBetaToken('s', bad)).toBeNull();
    expect(safeEqual('a', 'a')).toBe(true);
    expect(safeEqual('a', 'b')).toBe(false);
    expect(safeEqual('', '')).toBe(false);
  });
});

describe('POST /v1/beta/redeem', () => {
  it('exchanges a code for a one-year token, up to three times', async () => {
    ctx = await createTestApp({ env: { BETA_HMAC_SECRET: 'secret' } });
    const code = ctx.app.deps.invites.create({ email: 'x@y.sk' });
    for (let i = 0; i < 3; i++) {
      const res = await ctx.app.inject({ method: 'POST', url: '/v1/beta/redeem', payload: { code: code.toLowerCase() } });
      expect(res.statusCode).toBe(200);
      const { token, expiresAt } = res.json();
      expect(verifyBetaToken('secret', token)).toMatchObject({ code, exp: expiresAt });
      expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(364 * 24 * 3600 * 1000);
    }
    let res = await ctx.app.inject({ method: 'POST', url: '/v1/beta/redeem', payload: { code } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('CODE_USED');
    res = await ctx.app.inject({ method: 'POST', url: '/v1/beta/redeem', payload: { code: 'NOPE-NOPE-NOPE' } });
    expect(res.json().error.code).toBe('INVALID_CODE');
    res = await ctx.app.inject({ method: 'POST', url: '/v1/beta/redeem', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(ctx.app.deps.invites.counts()).toEqual({ total: 1, redeemed: 1 });
  });

  it('answers 503 without a secret', async () => {
    ctx = await createTestApp();
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/beta/redeem', payload: { code: 'AAAA-BBBB-CCCC' } });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('NOT_CONFIGURED');
  });
});

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

  it('export the waitlist as CSV and the counters as JSON', async () => {
    ctx = await createTestApp({ env: { ADMIN_TOKEN: 'owner-token', BETA_HMAC_SECRET: 's' } });
    await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: { email: 'a@b.sk', lang: 'de', consent: true, source: 'x, "y"', interests: ['vat-reports', 'efaktura-receive'], startedAt: Date.now() - 9000 } });
    await ctx.app.inject({ method: 'GET', url: '/v1/health' });
    const auth = { authorization: 'Bearer owner-token' };
    let res = await ctx.app.inject({ method: 'GET', url: '/v1/admin/waitlist.csv', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.body.trim().split('\r\n');
    expect(lines[0]).toBe('email,lang,status,source,interests,vatPayer,consentAt,confirmedAt');
    expect(lines[1]).toMatch(/^a@b\.sk,de,pending,"x, ""y""",vat-reports;efaktura-receive,,\d{4}-.*,$/);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/admin/stats', headers: auth });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ waitlist: { pending: 1 }, invites: { total: 0, redeemed: 0 }, totals: { requests: expect.any(Number) } });
    expect(JSON.stringify(res.json())).not.toContain('a@b.sk');
    expect(toCsv([{ email: 'x', interests: null }])).toBe('email,lang,status,source,interests,vatPayer,consentAt,confirmedAt\r\nx,,,,,,,\r\n');
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
