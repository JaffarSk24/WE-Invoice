import { describe, it, expect } from 'vitest';
import { createTestApp } from './helpers.js';

describe('rate limit', () => {
  it('answers 429 RATE_LIMITED per ip after the route limit', async () => {
    const { app } = await createTestApp({ env: { RATE_LIMIT_SCALE: '1' } });
    const statuses = [];
    // An empty body answers 400 without the upstream; the limit counts it.
    const receipt = (remoteAddress) => app.inject({ method: 'POST', url: '/v1/ekasa/receipt', payload: {}, remoteAddress });
    for (let i = 0; i < 21; i++) {
      const res = await receipt('203.0.113.5');
      statuses.push(res.statusCode);
      if (res.statusCode === 429) {
        expect(res.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } });
        expect(res.headers['retry-after']).toBeTruthy();
      }
    }
    expect(statuses).toEqual([...Array(20).fill(400), 429]);
    expect((await receipt('203.0.113.6')).statusCode).toBe(400);
    const health = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(health.headers['x-ratelimit-limit']).toBe('120');
    await app.close();
  });

  it('scales every limit with RATE_LIMIT_SCALE', async () => {
    const { app } = await createTestApp({ env: { RATE_LIMIT_SCALE: '0.5' } });
    const health = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(health.headers['x-ratelimit-limit']).toBe('60');
    const res = await app.inject({ method: 'POST', url: '/v1/ekasa/receipt', payload: {} });
    expect(res.headers['x-ratelimit-limit']).toBe('10');
    await app.close();
  });
});
