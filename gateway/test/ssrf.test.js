import { describe, it, expect } from 'vitest';
import { isPrivateV4, isPrivateV6, isPrivateAddress, resolvePublicHost, assertSameOrigin } from '../src/lib/ssrf.js';
import { guardedLookup, createGuardedAgent } from '../src/lib/guarded-agent.js';
import { PUBLIC_IP, publicLookup, privateLookup } from './helpers.js';

describe('private address detection', () => {
  it.each(['10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.0.1', '172.31.255.255', '192.168.0.1', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '192.0.2.1', '198.18.0.1'])('%s is private', (ip) => {
    expect(isPrivateV4(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '93.184.216.34', '172.32.0.1', '11.0.0.1', '100.128.0.1'])('%s is public', (ip) => {
    expect(isPrivateV4(ip)).toBe(false);
  });

  it.each(['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'ff02::1', '2001:db8::1'])('%s is private', (ip) => {
    expect(isPrivateV6(ip)).toBe(true);
  });

  it.each(['2a00:1450:4001:80b::200e', '::ffff:8.8.8.8', '2606:4700::6810:84e5'])('%s is public', (ip) => {
    expect(isPrivateV6(ip)).toBe(false);
  });

  it('treats garbage as private', () => {
    expect(isPrivateAddress('not-an-ip')).toBe(true);
    expect(isPrivateV4('1.2.3')).toBe(true);
    expect(isPrivateV6('zz::1')).toBe(true);
  });
});

describe('resolvePublicHost', () => {
  it('returns the addresses of a public host', async () => {
    expect(await resolvePublicHost('api.example.test', publicLookup)).toEqual([{ address: PUBLIC_IP, family: 4 }]);
    expect(await resolvePublicHost('[2606:4700::6810:84e5]')).toEqual([{ address: '2606:4700::6810:84e5', family: 6 }]);
  });

  it('refuses private, local and unresolvable hosts', async () => {
    await expect(resolvePublicHost('internal.example.test', privateLookup)).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    await expect(resolvePublicHost('localhost', publicLookup)).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    await expect(resolvePublicHost('db.internal', publicLookup)).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    await expect(resolvePublicHost('127.0.0.1')).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    await expect(resolvePublicHost('x.test', async () => [])).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    await expect(resolvePublicHost('x.test', async () => [{ address: PUBLIC_IP, family: 4 }, { address: '10.0.0.1', family: 4 }])).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    await expect(resolvePublicHost('x.test', async () => { throw new Error('ENOTFOUND'); })).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });
});

describe('assertSameOrigin', () => {
  it('allows a redirect on the same https host only', () => {
    expect(assertSameOrigin('https://a.test/x', '/y').href).toBe('https://a.test/y');
    expect(assertSameOrigin('https://a.test/x', 'https://a.test/z?q=1').href).toBe('https://a.test/z?q=1');
    expect(() => assertSameOrigin('https://a.test/x', 'https://b.test/y')).toThrow(/another host/);
    expect(() => assertSameOrigin('https://a.test/x', 'http://a.test/y')).toThrow(/another host/);
  });
});

describe('guarded agent lookup', () => {
  const fake = (addresses, err) => (host, options, cb) => cb(err || null, addresses);

  it('passes public addresses in both shapes', async () => {
    const one = guardedLookup(fake([{ address: PUBLIC_IP, family: 4 }]));
    await expect(new Promise((res, rej) => one('h', {}, (e, a, f) => (e ? rej(e) : res([a, f]))))).resolves.toEqual([PUBLIC_IP, 4]);
    await expect(new Promise((res, rej) => one('h', { all: true }, (e, a) => (e ? rej(e) : res(a))))).resolves.toEqual([{ address: PUBLIC_IP, family: 4 }]);
    const single = guardedLookup(fake({ address: PUBLIC_IP, family: 4 }));
    await expect(new Promise((res, rej) => single('h', {}, (e, a) => (e ? rej(e) : res(a))))).resolves.toBe(PUBLIC_IP);
  });

  it('refuses private addresses and passes errors', async () => {
    const bad = guardedLookup(fake([{ address: PUBLIC_IP, family: 4 }, { address: '192.168.1.1', family: 4 }]));
    await expect(new Promise((res, rej) => bad('h', {}, (e, a) => (e ? rej(e) : res(a))))).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    const empty = guardedLookup(fake([]));
    await expect(new Promise((res, rej) => empty('h', {}, (e, a) => (e ? rej(e) : res(a))))).rejects.toMatchObject({ code: 'HOST_NOT_ALLOWED' });
    const failing = guardedLookup(fake(null, new Error('ENOTFOUND')));
    await expect(new Promise((res, rej) => failing('h', {}, (e, a) => (e ? rej(e) : res(a))))).rejects.toThrow('ENOTFOUND');
  });

  it('builds an agent', async () => {
    const agent = createGuardedAgent({ timeoutMs: 100 });
    expect(agent).toBeTruthy();
    await agent.close();
  });
});
