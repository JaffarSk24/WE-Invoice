import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createPolicy, providerHosts, isPrivateIp, validateCustomHost, normalizeRequest, REGISTER_HOSTS, MAX_BODY_BYTES } = require('./net-policy.cjs');
const { createNet } = require('./net.cjs');
const providers = require('../packages/core/peppol/providers.json');

const withUrls = {
  providers: [
    { id: 'a', baseUrl: { prod: 'https://api.provider-a.sk/v1', sandbox: 'https://sandbox.provider-a.sk/v1' } },
    { id: 'b', baseUrl: { prod: null, sandbox: null } },
    { id: 'c' }
  ]
};

describe('network policy', () => {
  it('collects the hosts of known provider URLs', () => {
    expect(providerHosts(withUrls)).toEqual(['api.provider-a.sk', 'sandbox.provider-a.sk']);
    expect(providerHosts(providers)).toEqual(expect.any(Array));
    expect(providerHosts(null)).toEqual([]);
  });

  it('allows https to listed hosts only', () => {
    const policy = createPolicy({ providers: withUrls });
    expect(policy.checkUrl('https://api.provider-a.sk/v1/documents').ok).toBe(true);
    expect(policy.checkUrl(`https://${REGISTER_HOSTS[0]}/v1/rates`).ok).toBe(true);
    expect(policy.checkUrl('http://api.provider-a.sk/v1').code).toBe('NET_BAD_URL');
    expect(policy.checkUrl('https://user:pw@api.provider-a.sk/').code).toBe('NET_BAD_URL');
    expect(policy.checkUrl('https://evil.example.com/').code).toBe('NET_HOST_BLOCKED');
    expect(policy.checkUrl('https://10.0.0.1/').code).toBe('NET_HOST_BLOCKED');
    expect(policy.checkUrl('not a url').code).toBe('NET_BAD_URL');
    expect(policy.checkUrl('https://API.Provider-A.sk/x').ok).toBe(true);
  });

  it('lets the user add a public host and forget it again', () => {
    const policy = createPolicy({ providers: withUrls });
    expect(policy.allowHost('Peppol.custom-provider.eu').ok).toBe(true);
    expect(policy.checkUrl('https://peppol.custom-provider.eu/api').ok).toBe(true);
    expect(policy.forgetHost('peppol.custom-provider.eu')).toBe(true);
    expect(policy.checkUrl('https://peppol.custom-provider.eu/api').ok).toBe(false);
    // Built-in hosts cannot be removed.
    expect(policy.forgetHost('api.provider-a.sk')).toBe(false);
    expect(policy.hosts()).toContain('api.provider-a.sk');
  });

  it('refuses private, local and malformed custom hosts', () => {
    ['localhost', '127.0.0.1', '::1', 'printer.local', 'gateway.lan', 'bad_host.sk', 'nodots', '-x.sk', ''].forEach(h => {
      expect(validateCustomHost(h).ok, h).toBe(false);
    });
    expect(validateCustomHost('api.example.sk.').host).toBe('api.example.sk');
  });

  it('knows private addresses', () => {
    ['10.1.2.3', '127.0.0.1', '192.168.1.1', '172.16.0.9', '169.254.1.1', '0.0.0.0', '::1', '::', 'fe80::1', 'fd00::1', '::ffff:10.0.0.1', '100.64.0.1']
      .forEach(ip => expect(isPrivateIp(ip), ip).toBe(true));
    ['8.8.8.8', '172.32.0.1', '2a00:1450::1', '::ffff:8.8.8.8'].forEach(ip => expect(isPrivateIp(ip), ip).toBe(false));
  });

  it('normalises the request', () => {
    const r = normalizeRequest({ method: 'post', headers: { Host: 'x', 'Content-Type': 'application/json', Authorization: 'Bearer t' }, body: '{}', timeoutMs: 999999 });
    expect(r).toEqual({ ok: true, method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer t' }, timeoutMs: 120000, body: '{}' });
    expect(normalizeRequest({ method: 'TRACE' }).code).toBe('NET_BAD_URL');
    expect(normalizeRequest({ body: 'x'.repeat(MAX_BODY_BYTES + 1) }).code).toBe('NET_TOO_LARGE');
    expect(normalizeRequest({ method: 'GET', body: 'ignored' }).body).toBe(null);
    expect(normalizeRequest({ body: 12 }).ok).toBe(false);
    expect(normalizeRequest(null).timeoutMs).toBe(30000);
  });
});

function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new Error(`no route ${url}`);
    if (route.throw) throw route.throw;
    return new Response(route.body == null ? null : route.body, { status: route.status || 200, headers: route.headers || {} });
  };
  return { impl, calls };
}

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

describe('weNet requests', () => {
  const base = { providers: withUrls, lookup: publicLookup };

  it('returns status, headers and bytes', async () => {
    const { impl, calls } = fakeFetch({ 'https://api.provider-a.sk/v1/ping': { body: 'pong', headers: { 'x-a': '1' } } });
    const net = createNet({ ...base, fetchImpl: impl });
    const res = await net.request({ url: 'https://api.provider-a.sk/v1/ping', headers: { Authorization: 'k' } });
    expect(res.status).toBe(200);
    expect(res.ok).toBe(true);
    expect(res.headers['x-a']).toBe('1');
    expect(Buffer.from(res.body).toString()).toBe('pong');
    expect(calls[0].init.headers.authorization).toBe('k');
    expect(calls[0].init.headers['user-agent']).toBe('WE-Invoice');
    expect(calls[0].init.redirect).toBe('manual');
  });

  it('refuses hosts outside the allowlist before connecting', async () => {
    const { impl, calls } = fakeFetch({});
    const net = createNet({ ...base, fetchImpl: impl });
    expect((await net.request({ url: 'https://evil.example.com/' })).error.code).toBe('NET_HOST_BLOCKED');
    expect((await net.request({ url: 'http://api.provider-a.sk/' })).error.code).toBe('NET_BAD_URL');
    expect(calls).toEqual([]);
  });

  it('refuses a host that resolves into the local network', async () => {
    const { impl, calls } = fakeFetch({});
    const net = createNet({ ...base, fetchImpl: impl, lookup: async () => [{ address: '192.168.0.5', family: 4 }] });
    net.allowHost('rebind.example.sk');
    expect((await net.request({ url: 'https://rebind.example.sk/' })).error.code).toBe('NET_HOST_BLOCKED');
    expect(calls).toEqual([]);
  });

  it('follows redirects only to allowed hosts', async () => {
    const { impl } = fakeFetch({
      'https://api.provider-a.sk/old': { status: 302, headers: { location: '/new' } },
      'https://api.provider-a.sk/new': { body: 'moved' },
      'https://api.provider-a.sk/away': { status: 302, headers: { location: 'https://evil.example.com/' } }
    });
    const net = createNet({ ...base, fetchImpl: impl });
    expect(Buffer.from((await net.request({ url: 'https://api.provider-a.sk/old' })).body).toString()).toBe('moved');
    expect((await net.request({ url: 'https://api.provider-a.sk/away' })).error.code).toBe('NET_REDIRECT_BLOCKED');
  });

  it('turns a POST into a GET after a 303', async () => {
    const { impl, calls } = fakeFetch({
      'https://api.provider-a.sk/submit': { status: 303, headers: { location: 'https://api.provider-a.sk/result' } },
      'https://api.provider-a.sk/result': { body: 'ok' }
    });
    const net = createNet({ ...base, fetchImpl: impl });
    await net.request({ url: 'https://api.provider-a.sk/submit', method: 'POST', body: 'data' });
    expect(calls[1].init.method).toBe('GET');
    expect(calls[1].init.body).toBe(null);
  });

  it('stops redirect loops', async () => {
    const { impl, calls } = fakeFetch({ 'https://api.provider-a.sk/loop': { status: 301, headers: { location: 'https://api.provider-a.sk/loop' } } });
    const net = createNet({ ...base, fetchImpl: impl });
    expect((await net.request({ url: 'https://api.provider-a.sk/loop' })).error.code).toBe('NET_REDIRECT_BLOCKED');
    expect(calls.length).toBe(4);
  });

  it('reports timeouts and failures by code', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const { impl } = fakeFetch({ 'https://api.provider-a.sk/slow': { throw: timeout }, 'https://api.provider-a.sk/down': { throw: new TypeError('fetch failed') } });
    const net = createNet({ ...base, fetchImpl: impl });
    expect((await net.request({ url: 'https://api.provider-a.sk/slow' })).error.code).toBe('NET_TIMEOUT');
    expect((await net.request({ url: 'https://api.provider-a.sk/down' })).error.code).toBe('NET_FAILED');
  });

  it('refuses responses over the size limit', async () => {
    const big = new Uint8Array(MAX_BODY_BYTES + 1);
    const { impl } = fakeFetch({ 'https://api.provider-a.sk/big': { body: big } });
    const net = createNet({ ...base, fetchImpl: impl });
    expect((await net.request({ url: 'https://api.provider-a.sk/big' })).error.code).toBe('NET_TOO_LARGE');
  });
});
