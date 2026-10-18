import { describe, it, expect } from 'vitest';
import { assertTransport, TRANSPORT_SHAPE } from './interface.js';
import { createWebTransport } from './web.js';
import { createDesktopTransport } from './desktop.js';

describe('transport', () => {
  it('the web transport has the full shape', () => {
    const t = assertTransport(createWebTransport({ gatewayUrl: 'https://gw.example/' }));
    expect(t.platform).toBe('web');
    expect(t.gatewayUrl('/v1/health')).toBe('https://gw.example/v1/health');
  });

  it('the desktop transport maps the platform and the net bridge', async () => {
    const calls = [];
    const win = { wePlatform: { os: 'win32' }, weNet: { request: async (r) => { calls.push(r); return { status: 200 }; } } };
    const t = assertTransport(createDesktopTransport(win));
    expect(t.platform).toBe('win');
    await t.http({ url: 'https://x.example' });
    expect(calls).toHaveLength(1);
    expect(createDesktopTransport({ wePlatform: { os: 'darwin' } }).platform).toBe('mac');
  });

  it('names what is missing', () => {
    expect(() => assertTransport({ platform: 'web' })).toThrow(/http/);
    expect(TRANSPORT_SHAPE.groups.drive).toEqual(['list', 'get', 'put', 'delete']);
  });

  it('unimplemented parts reject with NOT_IMPLEMENTED', async () => {
    await expect(createWebTransport().drive.list('/')).rejects.toMatchObject({ code: 'NOT_IMPLEMENTED' });
  });

  it('http wraps fetch into the response shape', async () => {
    const fetchImpl = async () => new Response('{"a":1}', { status: 200, headers: { 'content-type': 'application/json' } });
    const res = await createWebTransport({ fetchImpl }).http({ url: 'https://x.example' });
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ a: 1 });
    expect(res.headers['content-type']).toBe('application/json');
  });
});
