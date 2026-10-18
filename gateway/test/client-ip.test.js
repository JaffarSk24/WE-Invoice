// The client IP behind nginx: one trusted hop, so a forged
// X-Forwarded-For sent by the client cannot change the address the rate
// limits and the logs use.
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { loadConfig } from '../src/config.js';

describe('client IP behind the proxy', () => {
  it('takes the address nginx appended, not the one the client wrote', async () => {
    const app = Fastify({ trustProxy: loadConfig({}).trustProxy });
    app.get('/ip', async (request) => ({ ip: request.ip }));
    const res = await app.inject({ method: 'GET', url: '/ip', headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }, remoteAddress: '172.17.0.1' });
    expect(res.json().ip).toBe('203.0.113.9');
    await app.close();
  });
});
