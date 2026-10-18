import { describe, it, expect, vi } from 'vitest';
import { createDesktopTransport, fromNetResponse, TransportError } from './desktop.js';

const bytes = (s) => new TextEncoder().encode(s);

describe('desktop transport', () => {
  it('wraps a weNet answer into the response shape', async () => {
    const res = fromNetResponse({ status: 200, ok: true, headers: { 'content-type': 'application/json' }, body: bytes('{"a":1}') });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"a":1}');
    expect(await res.json()).toEqual({ a: 1 });
    expect((await res.bytes()).length).toBe(7);
  });

  it('rejects with the code of a weNet error', async () => {
    const win = { wePlatform: { os: 'darwin' }, weNet: { request: async () => ({ error: { code: 'NET_HOST_BLOCKED', message: 'x' } }) } };
    await expect(createDesktopTransport(win).http({ url: 'https://evil.example' })).rejects.toMatchObject({ code: 'NET_HOST_BLOCKED' });
    expect(() => fromNetResponse(null)).toThrow(TransportError);
  });

  it('passes method, headers, body and timeout to weNet', async () => {
    const request = vi.fn(async () => ({ status: 204, ok: true, headers: {}, body: new Uint8Array(0) }));
    const transport = createDesktopTransport({ wePlatform: { os: 'win32' }, weNet: { request } });
    await transport.http({ url: 'https://a.example', method: 'POST', headers: { a: '1' }, body: 'x', timeoutMs: 5000 });
    expect(request).toHaveBeenCalledWith({ url: 'https://a.example', method: 'POST', headers: { a: '1' }, body: 'x', timeoutMs: 5000 });
  });

  it('unwraps weSecrets answers and reports their errors', async () => {
    const weSecrets = {
      get: async (name) => (name === 'ok' ? { ok: true, value: 'v' } : { ok: false, error: 'UNREADABLE' }),
      set: async () => ({ ok: true, stored: false }),
      delete: async () => ({ ok: true })
    };
    const transport = createDesktopTransport({ wePlatform: { os: 'darwin' }, weSecrets });
    expect(await transport.secrets.get('ok')).toBe('v');
    await expect(transport.secrets.get('bad')).rejects.toMatchObject({ code: 'SECRETS_UNREADABLE' });
    expect(await transport.secrets.set('ok', 'v')).toBe(false);
    expect(await transport.secrets.delete('ok')).toBe(true);
  });

  it('notifies through the main process', () => {
    const notify = vi.fn(async () => true);
    createDesktopTransport({ wePlatform: { os: 'darwin' }, weApp: { notify } }).notify('Title', 'Body');
    expect(notify).toHaveBeenCalledWith('Title', 'Body');
  });
});
