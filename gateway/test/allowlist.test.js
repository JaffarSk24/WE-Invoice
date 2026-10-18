import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadProviders, buildAllowlist, resolveUpstreamBase, resolveProvidersFile, createAllowlist } from '../src/providers/allowlist.js';
import { loadConfig } from '../src/config.js';

const CONTRACT = fileURLToPath(new URL('../../packages/core/peppol/providers.json', import.meta.url));

describe('provider allow-list', () => {
  it('is built from the contract file, not from a list of its own', () => {
    const providers = loadProviders();
    const ids = JSON.parse(readFileSync(CONTRACT, 'utf8')).providers.map(p => p.id);
    expect(providers.map(p => p.id)).toEqual(ids);
    expect(resolveProvidersFile()).toBe(CONTRACT);
    expect(resolveProvidersFile('/x/y.json')).toBe('/x/y.json');
    expect(() => loadProviders('/nonexistent/providers.json')).toThrow();
    expect(createAllowlist(loadConfig({})).size).toBe(ids.length);
  });

  it('refuses a file without providers', () => {
    const tmp = fileURLToPath(new URL('./fixtures.js', import.meta.url));
    expect(() => loadProviders(tmp)).toThrow();
  });

  it('allows only providers with an address, the override wins', () => {
    const list = buildAllowlist([
      { id: 'a', baseUrl: { prod: 'https://a.test/api/', sandbox: null } },
      { id: 'b', baseUrl: { prod: null, sandbox: 'https://sandbox.b.test' } },
      { id: 'sapi-sk', baseUrl: { prod: null, sandbox: null }, customBaseUrl: true },
      null, { noId: true }
    ], { b: 'https://b.test', 'b-sandbox': 'https://sb.test' });
    expect(list.size).toBe(3);
    expect(resolveUpstreamBase('a', {}, list).base.href).toBe('https://a.test/api');
    expect(resolveUpstreamBase('b', {}, list).base.href).toBe('https://b.test/');
    expect(resolveUpstreamBase('b-sandbox', {}, list).base.href).toBe('https://sb.test/');
    expect(() => resolveUpstreamBase('a-sandbox', {}, list)).toThrow(expect.objectContaining({ code: 'PROVIDER_NOT_CONFIGURED' }));
    expect(() => resolveUpstreamBase('zzz', {}, list)).toThrow(expect.objectContaining({ code: 'HOST_NOT_ALLOWED' }));
  });

  it('a provider without a published address is not configured', () => {
    const list = buildAllowlist(loadProviders());
    expect(() => resolveUpstreamBase('verteco', {}, list)).toThrow(expect.objectContaining({ code: 'PROVIDER_NOT_CONFIGURED' }));
  });

  it('takes the custom base of sapi-sk from the header with checks', () => {
    const list = buildAllowlist(loadProviders());
    expect(resolveUpstreamBase('sapi-sk', { 'x-upstream-base': 'https://api.provider.test/sapi/v1/' }, list)).toMatchObject({ custom: true });
    expect(resolveUpstreamBase('sapi-sk', { 'x-upstream-base': 'https://api.provider.test/sapi/v1/' }, list).base.pathname).toBe('/sapi/v1');
    expect(() => resolveUpstreamBase('sapi-sk', {}, list)).toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
    expect(() => resolveUpstreamBase('sapi-sk', { 'x-upstream-base': 'nonsense' }, list)).toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));
    expect(() => resolveUpstreamBase('sapi-sk', { 'x-upstream-base': 'http://api.provider.test' }, list)).toThrow(expect.objectContaining({ code: 'HOST_NOT_ALLOWED' }));
    expect(() => resolveUpstreamBase('sapi-sk', { 'x-upstream-base': 'https://user:pw@api.provider.test' }, list)).toThrow(expect.objectContaining({ code: 'HOST_NOT_ALLOWED' }));
    expect(() => resolveUpstreamBase('sapi-sk', { 'x-upstream-base': 'https://api.provider.test/?x=1' }, list)).toThrow(expect.objectContaining({ code: 'HOST_NOT_ALLOWED' }));
  });

  it('rejects an invalid configured address', () => {
    const list = buildAllowlist([{ id: 'a', baseUrl: { prod: 'not a url' } }, { id: 'b', baseUrl: { prod: 'ftp://b.test' } }]);
    expect(() => resolveUpstreamBase('a', {}, list)).toThrow(expect.objectContaining({ code: 'PROVIDER_NOT_CONFIGURED' }));
    expect(() => resolveUpstreamBase('b', {}, list)).toThrow(expect.objectContaining({ code: 'HOST_NOT_ALLOWED' }));
  });
});
