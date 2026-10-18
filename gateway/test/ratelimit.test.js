import { describe, it, expect } from 'vitest';
import { createTestApp } from './helpers.js';

describe('rate limit', () => {
  it('answers 429 RATE_LIMITED per ip after the route limit', async () => {
    const { app } = await createTestApp({ env: { RATE_LIMIT_SCALE: '1' } });
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.inject({ method: 'POST', url: '/v1/waitlist', payload: { email: 'x@y.sk', lang: 'sk', consent: true, website: 'bot' }, remoteAddress: '203.0.113.5' });
      statuses.push(res.statusCode);
      if (res.statusCode === 429) {
        expect(res.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
        expect(res.headers['retry-after']).toBeTruthy();
      }
    }
    expect(statuses).toEqual([202, 202, 202, 202, 202, 429]);
    const other = await app.inject({ method: 'POST', url: '/v1/waitlist', payload: { email: 'x@y.sk', lang: 'sk', consent: true, website: 'bot' }, remoteAddress: '203.0.113.6' });
    expect(other.statusCode).toBe(202);
    const health = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(health.headers['x-ratelimit-limit']).toBe('120');
    await app.close();
  });

  it('scales every limit with RATE_LIMIT_SCALE', async () => {
    const { app } = await createTestApp({ env: { RATE_LIMIT_SCALE: '0.5' } });
    const health = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(health.headers['x-ratelimit-limit']).toBe('60');
    const res = await app.inject({ method: 'POST', url: '/v1/beta/redeem', payload: { code: 'x' } });
    expect(res.headers['x-ratelimit-limit']).toBe('5');
    await app.close();
  });
});
