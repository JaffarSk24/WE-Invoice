import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { Cloud, grantsDrive, DRIVE_SCOPE } = require('./cloud.cjs');
const { createDriveClient } = require('./cloud-drive.cjs');

function tempDir() {
  return mkdtempSync(path.join(tmpdir(), 'we-invoice-cloud-'));
}

// A fake Google: the token endpoint and a tiny Drive.
function fakeGoogle() {
  const state = { refreshes: 0, files: new Map(), seq: 0, revoked: [] };
  const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } });
  state.fetch = async (url, options = {}) => {
    const u = new URL(url);
    if (u.hostname === 'oauth2.googleapis.com' && u.pathname === '/token') {
      const body = new URLSearchParams(options.body);
      if (body.get('grant_type') === 'refresh_token') {
        if (body.get('refresh_token') === 'dead') return json({ error: 'invalid_grant' }, 400);
        state.refreshes++;
        return json({ access_token: `fresh-${state.refreshes}`, expires_in: 3600, scope: DRIVE_SCOPE });
      }
      return json({ access_token: 'first', refresh_token: 'rt', expires_in: 3600, scope: DRIVE_SCOPE });
    }
    if (u.pathname === '/revoke') { state.revoked.push(new URLSearchParams(options.body).get('token')); return new Response(null, { status: 200 }); }
    if (u.pathname === '/oauth2/v2/userinfo') return json({ email: 'owner@example.com' });
    if (options.headers.Authorization === 'Bearer stale') return new Response('', { status: 401 });
    if (u.pathname === '/drive/v3/files' && (options.method || 'GET') === 'GET') {
      const q = u.searchParams.get('q');
      const name = (q.match(/name = '([^']+)'/) || [])[1];
      const parent = (q.match(/'([^']+)' in parents/) || [])[1];
      const found = Array.from(state.files.values()).filter(f => (!name || f.name === name) && (!parent || f.parents[0] === parent));
      return json({ files: found.map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, version: String(f.version), modifiedTime: 't', size: String(f.bytes ? f.bytes.length : 0) })) });
    }
    if (u.pathname === '/drive/v3/files' && options.method === 'POST') {
      const b = JSON.parse(options.body);
      const f = { id: `id${++state.seq}`, name: b.name, mimeType: b.mimeType, parents: b.parents, version: 1 };
      state.files.set(f.id, f);
      return json({ id: f.id, name: f.name, mimeType: f.mimeType, version: '1' });
    }
    if (u.pathname.startsWith('/upload/drive/v3/files')) {
      const text = options.body.toString('utf8');
      const parts = text.split(/--we-invoice-[0-9a-f]+/);
      const metadata = JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
      const payload = parts[2].split('\r\n\r\n')[1].replace(/\r\n$/, '');
      const id = u.pathname.split('/')[5];
      let f = id ? state.files.get(id) : null;
      if (f) { f.bytes = Buffer.from(payload); f.version++; } else {
        f = { id: `id${++state.seq}`, name: metadata.name, mimeType: 'application/octet-stream', parents: metadata.parents, bytes: Buffer.from(payload), version: 1 };
        state.files.set(f.id, f);
      }
      return json({ id: f.id, name: f.name, version: String(f.version), modifiedTime: 't' });
    }
    const m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (m && (options.method || 'GET') === 'GET') return new Response(state.files.get(m[1]).bytes, { status: 200 });
    if (m && options.method === 'DELETE') { state.files.delete(m[1]); return new Response(null, { status: 204 }); }
    return new Response('nope', { status: 500 });
  };
  return state;
}

describe('desktop cloud', () => {
  it('reads the OAuth client from userData first, then the bundled file', () => {
    const userData = tempDir();
    const bundled = tempDir();
    expect(new Cloud({ userData, bundledDir: bundled }).isConfigured()).toBe(false);
    writeFileSync(path.join(bundled, 'oauth-credentials.json'), JSON.stringify({ clientId: 'b', clientSecret: 's' }));
    expect(new Cloud({ userData, bundledDir: bundled }).credentials.clientId).toBe('b');
    writeFileSync(path.join(userData, 'google-credentials.json'), JSON.stringify({ clientId: 'o', clientSecret: 's' }));
    expect(new Cloud({ userData, bundledDir: bundled }).credentials.clientId).toBe('o');
    expect(grantsDrive('')).toBe(true);
    expect(grantsDrive('email')).toBe(false);
    expect(grantsDrive(`email ${DRIVE_SCOPE}`)).toBe(true);
  });

  it('refreshes the access token, retries once after a 401 and drops a dead sign-in', async () => {
    const userData = tempDir();
    writeFileSync(path.join(userData, 'google-credentials.json'), JSON.stringify({ clientId: 'c', clientSecret: 's' }));
    writeFileSync(path.join(userData, 'google-tokens.json'), JSON.stringify({ access_token: 'stale', refresh_token: 'rt', expiry: Date.now() + 3600000, email: 'owner@example.com', clientId: 'c' }));
    const google = fakeGoogle();
    const cloud = new Cloud({ userData, fetchImpl: google.fetch });
    expect(cloud.status()).toMatchObject({ ok: true, signedIn: true, email: 'owner@example.com', configured: true });
    expect((await cloud.list('')).entries).toEqual([]);
    expect(google.refreshes).toBe(1);
    const saved = await cloud.put('c1/data.json.gz.enc', 'hello');
    expect(saved.ok).toBe(true);
    expect(saved.saved.version).toBe('1');
    const got = await cloud.get('c1/data.json.gz.enc');
    expect(Buffer.from(got.file.bytes).toString()).toBe('hello');
    expect((await cloud.list('c1')).entries[0].path).toBe('c1/data.json.gz.enc');
    expect((await cloud.delete('c1/data.json.gz.enc')).deleted).toBe(true);
    expect(JSON.parse(readFileSync(path.join(userData, 'google-tokens.json'), 'utf8')).access_token).toBe('fresh-1');
    cloud.tokens.refresh_token = 'dead';
    cloud.tokens.expiry = 0;
    const result = await cloud.list('');
    expect(result).toMatchObject({ ok: false, code: 'NOT_SIGNED_IN' });
    expect(existsSync(path.join(userData, 'google-tokens.json'))).toBe(false);
    expect(cloud.status().signedIn).toBe(false);
  });

  it('signs out, revokes the token and refuses without a client', async () => {
    const userData = tempDir();
    writeFileSync(path.join(userData, 'google-credentials.json'), JSON.stringify({ clientId: 'c', clientSecret: 's' }));
    writeFileSync(path.join(userData, 'google-tokens.json'), JSON.stringify({ access_token: 'a', refresh_token: 'rt', expiry: 0, clientId: 'c' }));
    const google = fakeGoogle();
    const cloud = new Cloud({ userData, fetchImpl: google.fetch });
    expect(await cloud.signOut()).toEqual({ ok: true });
    expect(google.revoked).toEqual(['rt']);
    expect(await cloud.getAccessToken()).toMatchObject({ ok: false, code: 'NOT_SIGNED_IN' });
    const bare = new Cloud({ userData: tempDir(), bundledDir: tempDir() });
    expect(await bare.signIn()).toMatchObject({ ok: false, code: 'NOT_CONFIGURED' });
  });

  it('the drive client maps network failures to OFFLINE', async () => {
    const drive = createDriveClient({ fetchImpl: async () => { throw new TypeError('fetch failed'); }, getToken: async () => 't' });
    await expect(drive.list('')).rejects.toMatchObject({ code: 'OFFLINE' });
  });
});
