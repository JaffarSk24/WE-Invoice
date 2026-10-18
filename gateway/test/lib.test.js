import { describe, it, expect, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { HttpError, publicCode, badRequest, notFound, upstreamUnavailable } from '../src/lib/errors.js';
import { openDb } from '../src/lib/db.js';
import { createCache, DAY } from '../src/lib/cache.js';
import { createStats } from '../src/lib/stats.js';
import { localDate, zoneOffsetMinutes, untilLocalMidnight, addDays, isIsoDate } from '../src/lib/time.js';

describe('config', () => {
  it('has safe defaults and reads the environment', () => {
    const c = loadConfig({});
    expect(c.host).toBe('127.0.0.1');
    expect(c.corsOrigins).toEqual(['https://jaffarsk24.github.io', 'http://localhost:5173']);
    expect(c.adminToken).toBe('');
    expect(c.proxy.baseUrls).toEqual({});
    const d = loadConfig({ PORT: '9000', CORS_ORIGINS: 'https://a.test, https://b.test', TRUST_PROXY: 'false', SITE_URL: 'https://s.test/', PROVIDER_BASE_URLS: '{"verteco":"https://api.verteco.test"}', RATE_LIMIT_SCALE: '0' });
    expect(d.port).toBe(9000);
    expect(d.corsOrigins).toEqual(['https://a.test', 'https://b.test']);
    expect(d.trustProxy).toBe(false);
    expect(d.siteUrl).toBe('https://s.test');
    expect(d.proxy.baseUrls.verteco).toBe('https://api.verteco.test');
    expect(d.rateLimitScale).toBe(0);
  });

  it('ignores invalid PROVIDER_BASE_URLS', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadConfig({ PROVIDER_BASE_URLS: '{bad' }).proxy.baseUrls).toEqual({});
    expect(loadConfig({ PROVIDER_BASE_URLS: '"text"' }).proxy.baseUrls).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('errors', () => {
  it('builds typed errors', () => {
    expect(badRequest()).toMatchObject({ statusCode: 400, code: 'BAD_REQUEST' });
    expect(notFound()).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(upstreamUnavailable()).toMatchObject({ statusCode: 502, code: 'UPSTREAM_UNAVAILABLE' });
    expect(new HttpError(418, 'TEAPOT')).toBeInstanceOf(Error);
  });

  it('maps framework codes to public ones', () => {
    expect(publicCode({ code: 'FST_ERR_VALIDATION' }, 400)).toBe('BAD_REQUEST');
    expect(publicCode({ code: 'FST_ERR_RATE_LIMIT' }, 429)).toBe('RATE_LIMITED');
    expect(publicCode({ code: 'FST_ERR_CTP_BODY_TOO_LARGE' }, 413)).toBe('BODY_TOO_LARGE');
    expect(publicCode({}, 415)).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(publicCode({ code: 'ECONNRESET' }, 500)).toBe('INTERNAL');
    expect(publicCode({ code: 'HOST_NOT_ALLOWED' }, 400)).toBe('BAD_REQUEST');
    expect(publicCode(new HttpError(400, 'HOST_NOT_ALLOWED'), 400)).toBe('HOST_NOT_ALLOWED');
  });
});

describe('sqlite cache', () => {
  it('stores values with a ttl and forgets them after it', async () => {
    let t = 1000;
    const cache = createCache(openDb(':memory:'), { now: () => t });
    expect(cache.get('k')).toBeUndefined();
    cache.set('k', { a: 1 }, 500);
    expect(cache.get('k')).toEqual({ a: 1 });
    t = 1600;
    expect(cache.get('k')).toBeUndefined();
    const loader = vi.fn().mockResolvedValue('v');
    expect(await cache.remember('r', DAY, loader)).toBe('v');
    expect(await cache.remember('r', DAY, loader)).toBe('v');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(await cache.remember('n', () => 0, async () => null)).toBeNull();
    expect(cache.get('n')).toBeUndefined();
  });

  it('sweeps expired rows every hundred writes', () => {
    let t = 0;
    const db = openDb(':memory:');
    const cache = createCache(db, { now: () => t });
    cache.set('old', 1, 10);
    t = 100;
    for (let i = 0; i < 100; i++) cache.set(`k${i}`, i, 1000);
    expect(db.prepare("SELECT COUNT(*) AS n FROM cache WHERE key = 'old'").get().n).toBe(0);
  });

  it('keeps the schema version', () => {
    const db = openDb(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(1);
  });
});

describe('stats', () => {
  it('counts requests per route and reports upstream health', () => {
    const stats = createStats(openDb(':memory:'));
    stats.record({ route: '/v1/health', statusCode: 200, durationMs: 4 });
    stats.record({ route: '/v1/health', statusCode: 502, durationMs: 6, upstreamError: true });
    stats.record({ statusCode: 404, durationMs: -1 });
    stats.upstream('rpo', true);
    stats.upstream('vies', false);
    const s = stats.snapshot();
    expect(s.totals).toEqual({ requests: 3, errors: 2, upstreamErrors: 1, durationMs: 10, avgDurationMs: 3 });
    expect(s.routes.find(r => r.route === '/v1/health')).toMatchObject({ requests: 2, errors: 1, avgDurationMs: 5 });
    expect(s.routes.find(r => r.route === 'unknown')).toBeTruthy();
    expect(s.upstreams).toEqual({ rpo: 'ok', vies: 'down' });
  });

  it('marks a stale upstream state as unknown', () => {
    const stats = createStats(openDb(':memory:'));
    vi.useFakeTimers();
    stats.upstream('ecb', true);
    vi.advanceTimersByTime(2 * 60 * 60 * 1000);
    expect(stats.upstreamStatus()).toEqual({ ecb: 'unknown' });
    vi.useRealTimers();
  });
});

describe('time', () => {
  it('gives the Bratislava calendar date and offset', () => {
    expect(localDate(new Date('2026-07-01T22:30:00Z'))).toBe('2026-07-02');
    expect(localDate(new Date('2026-01-01T22:30:00Z'))).toBe('2026-01-01');
    expect(zoneOffsetMinutes(new Date('2026-07-01T12:00:00Z'))).toBe(120);
    expect(zoneOffsetMinutes(new Date('2026-01-01T12:00:00Z'))).toBe(60);
  });

  it('computes the time until local midnight', () => {
    expect(untilLocalMidnight(new Date('2026-07-01T21:00:00Z'))).toBe(60 * 60 * 1000);
    expect(untilLocalMidnight(new Date('2026-01-01T22:59:30Z'))).toBe(60 * 1000);
    // DST ends on 2026-10-25 at 03:00 local: midnight is 23:00 UTC that day.
    expect(untilLocalMidnight(new Date('2026-10-25T00:30:00Z'))).toBe(22.5 * 60 * 60 * 1000);
  });

  it('adds days and validates dates', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(isIsoDate('2026-02-30')).toBe(true);
    expect(isIsoDate('2026-13-01')).toBe(false);
    expect(isIsoDate('yesterday')).toBe(false);
  });
});
