import { describe, it, expect } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

describe('GET /v1/health', () => {
  it('answers ok with the version and security headers', async () => {
    const app = await buildApp(loadConfig({ APP_VERSION: '9.9.9' }), { logger: false });
    const res = await app.inject({ method: 'GET', url: '/v1/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', version: '9.9.9' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    await app.close();
  });

  it('answers unknown routes in the common error format', async () => {
    const app = await buildApp(loadConfig({}), { logger: false });
    const res = await app.inject({ method: 'GET', url: '/v1/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
    await app.close();
  });
});
