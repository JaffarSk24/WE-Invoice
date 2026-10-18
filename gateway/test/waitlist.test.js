import { describe, it, expect, afterEach, vi } from 'vitest';
import { createTestApp } from './helpers.js';
import { openDb } from '../src/lib/db.js';
import { createWaitlist } from '../src/waitlist/service.js';
import { loadConfig } from '../src/config.js';
import { looksLikeBot } from '../src/routes/waitlist.js';

let ctx;
afterEach(async () => { if (ctx) await ctx.app.close(); ctx = null; });

const body = (extra = {}) => ({ email: 'Jana@Example.sk', lang: 'sk', consent: true, source: 'landing', interests: ['efaktura-send'], vatPayer: true, startedAt: Date.now() - 10000, ...extra });
const tokenOf = (mail, kind) => new URL(mail.text.match(new RegExp(`https://api.test/v1/waitlist/${kind}\\?token=[A-Za-z0-9_-]+`))[0]).searchParams.get('token');

describe('POST /v1/waitlist', () => {
  it('stores a pending record and sends the confirmation in the chosen language', async () => {
    ctx = await createTestApp();
    const res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body() });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: 'pending' });
    expect(ctx.sent).toHaveLength(1);
    const mail = ctx.sent[0];
    expect(mail.to).toBe('jana@example.sk');
    expect(mail.subject).toBe('Potvrďte svoj e-mail pre WE Invoice');
    expect(mail.text).toContain('48 hodín');
    expect(mail.html).toContain('<a href="https://api.test/v1/waitlist/confirm?token=');
    expect(mail.headers['List-Unsubscribe']).toMatch(/^<https:\/\/api\.test\/v1\/waitlist\/unsubscribe\?token=/);
    expect(ctx.app.deps.waitlist.all()).toEqual([expect.objectContaining({ email: 'jana@example.sk', status: 'pending', interests: ['efaktura-send'], vatPayer: true, source: 'landing' })]);
  });

  it('validates the body', async () => {
    ctx = await createTestApp();
    const cases = [
      [body({ consent: false }), 'CONSENT_REQUIRED'], [body({ email: 'nope' }), 'INVALID_EMAIL'], [body({ lang: 'xx' }), 'BAD_REQUEST'],
      [body({ interests: ['x'] }), 'BAD_REQUEST'], [{ lang: 'sk', consent: true }, 'BAD_REQUEST']
    ];
    for (const [payload, code] of cases) {
      const res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload });
      expect(res.statusCode, code).toBe(400);
      expect(res.json().error.code).toBe(code);
    }
    expect(ctx.sent).toHaveLength(0);
  });

  it('drops honeypot and too-fast submissions silently', async () => {
    ctx = await createTestApp();
    let res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body({ website: 'http://spam.test' }) });
    expect(res.statusCode).toBe(202);
    res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body({ startedAt: Date.now() - 500 }) });
    expect(res.statusCode).toBe(202);
    expect(ctx.sent).toHaveLength(0);
    expect(ctx.app.deps.waitlist.all()).toEqual([]);
    expect(looksLikeBot({ website: '' }, { minFillMs: 3000 })).toBeNull();
    expect(looksLikeBot({ startedAt: 10, website: '' }, { now: 1000, minFillMs: 3000 })).toBe('too-fast');
  });

  it('answers 503 MAIL_FAILED when the e-mail cannot be sent and 202 without SMTP', async () => {
    ctx = await createTestApp({ failMail: true });
    let res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body() });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('MAIL_FAILED');
    await ctx.app.close();
    ctx = await createTestApp({ transport: null });
    expect(ctx.app.deps.mailer.configured).toBe(false);
    res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body() });
    expect(res.statusCode).toBe(202);
  });
});

describe('double opt-in', () => {
  it('confirms once, tolerates a second click, refuses a bad token and unsubscribes', async () => {
    ctx = await createTestApp();
    await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body() });
    const confirmToken = tokenOf(ctx.sent[0], 'confirm');
    const unsubscribeToken = tokenOf(ctx.sent[0], 'unsubscribe');
    let res = await ctx.app.inject({ method: 'GET', url: `/v1/waitlist/confirm?token=${confirmToken}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://site.test/waitlist/thanks.html?lang=sk&status=confirmed');
    expect(ctx.app.deps.waitlist.all()[0]).toMatchObject({ status: 'confirmed' });
    res = await ctx.app.inject({ method: 'GET', url: `/v1/waitlist/confirm?token=${confirmToken}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_TOKEN');
    // A confirmed address that signs up again is accepted without a new e-mail.
    res = await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body() });
    expect(res.statusCode).toBe(202);
    expect(ctx.sent).toHaveLength(1);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/waitlist/confirm?token=garbage' });
    expect(res.statusCode).toBe(400);
    res = await ctx.app.inject({ method: 'GET', url: '/v1/waitlist/confirm' });
    expect(res.statusCode).toBe(400);
    res = await ctx.app.inject({ method: 'GET', url: `/v1/waitlist/unsubscribe?token=${unsubscribeToken}` });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://site.test/waitlist/unsubscribed.html?lang=sk&status=deleted');
    expect(ctx.app.deps.waitlist.all()).toEqual([]);
    res = await ctx.app.inject({ method: 'GET', url: `/v1/waitlist/unsubscribe?token=${unsubscribeToken}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_TOKEN');
  });

  it('renews the token for a pending address and expires it after the ttl', async () => {
    ctx = await createTestApp({ env: { WAITLIST_CONFIRM_TTL_HOURS: '2' } });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-18T10:00:00Z'));
    await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body({ startedAt: Date.now() - 10000 }) });
    const first = tokenOf(ctx.sent[0], 'confirm');
    await ctx.app.inject({ method: 'POST', url: '/v1/waitlist', payload: body({ lang: 'en', startedAt: Date.now() - 10000 }) });
    const second = tokenOf(ctx.sent[1], 'confirm');
    expect(second).not.toBe(first);
    expect(ctx.sent[1].subject).toBe('Confirm your e-mail for WE Invoice');
    let res = await ctx.app.inject({ method: 'GET', url: `/v1/waitlist/confirm?token=${first}` });
    expect(res.statusCode).toBe(400);
    vi.setSystemTime(new Date('2026-10-18T13:00:00Z'));
    res = await ctx.app.inject({ method: 'GET', url: `/v1/waitlist/confirm?token=${second}` });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('TOKEN_EXPIRED');
    vi.useRealTimers();
  });
});

describe('waitlist service', () => {
  it('purges expired pending and stale records', () => {
    let t = new Date('2026-01-01T00:00:00Z');
    const config = loadConfig({ WAITLIST_CONFIRM_TTL_HOURS: '1', WAITLIST_RETENTION_MONTHS: '1' });
    const db = openDb(':memory:');
    const wl = createWaitlist(db, config, { now: () => t });
    wl.subscribe({ email: 'old@x.sk', lang: 'sk' });
    const { record } = wl.subscribe({ email: 'confirmed@x.sk', lang: 'cs' });
    expect(wl.confirm(record.confirm_token).result).toBe('confirmed');
    expect(wl.confirm(record.confirm_token).result).toBe('invalid');
    expect(wl.unsubscribe(undefined).result).toBe('invalid');
    expect(wl.counts()).toEqual({ pending: 1, confirmed: 1 });
    t = new Date('2026-01-09T00:00:00Z');
    expect(wl.purge()).toBe(1);
    expect(wl.counts()).toEqual({ confirmed: 1 });
    t = new Date('2026-03-01T00:00:00Z');
    expect(wl.purge()).toBe(1);
    expect(wl.all()).toEqual([]);
  });
});
