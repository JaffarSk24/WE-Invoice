import { describe, it, expect } from 'vitest';
import { authUrl, parseAuthHash, redirectUri, grantsDrive, DRIVE_SCOPE } from './auth-web.js';
import { createDriveClient, ROOT_FOLDER } from './drive-api.js';

// A fake Drive API: folders and files with parents, multipart uploads
// parsed back, 401 and offline on demand.
function fakeDrive() {
  const files = new Map(); // id -> { id, name, mimeType, parents, bytes, version, modifiedTime }
  let seq = 0;
  const state = { files, calls: [], fail: null };
  const list = (q) => {
    const name = (q.match(/name = '((?:[^'\\]|\\.)*)'/) || [])[1];
    const parent = (q.match(/'([^']+)' in parents/) || [])[1];
    const folderOnly = q.includes("mimeType = 'application/vnd.google-apps.folder'");
    return Array.from(files.values()).filter(f => !f.trashed
      && (!name || f.name === name.replace(/\\'/g, "'"))
      && (!parent || f.parents.includes(parent))
      && (!folderOnly || f.mimeType === 'application/vnd.google-apps.folder'));
  };
  const meta = (f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: String(f.bytes ? f.bytes.length : 0), version: String(f.version), modifiedTime: f.modifiedTime });
  const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
  state.fetch = async (url, options = {}) => {
    state.calls.push({ url, method: options.method || 'GET' });
    if (state.fail === 'offline') { state.fail = null; throw new TypeError('Failed to fetch'); }
    if (state.fail === 401) { state.fail = null; return new Response('', { status: 401 }); }
    if (state.fail === 403) { state.fail = null; return new Response('Insufficient Permission', { status: 403 }); }
    const u = new URL(url);
    const method = options.method || 'GET';
    if (u.pathname === '/drive/v3/files' && method === 'GET') return json({ files: list(u.searchParams.get('q')).map(meta) });
    if (u.pathname === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(options.body);
      const f = { id: `id${++seq}`, name: body.name, mimeType: body.mimeType, parents: body.parents, bytes: null, version: 1, modifiedTime: 't' };
      files.set(f.id, f);
      return json(meta(f));
    }
    if (u.pathname.startsWith('/upload/drive/v3/files')) {
      const text = await options.body.text();
      const parts = text.split(/--we-invoice-[^\r\n]+/);
      const metadata = JSON.parse(parts[1].split('\r\n\r\n')[1].trim());
      const payload = parts[2].split('\r\n\r\n')[1].replace(/\r\n$/, '');
      const id = u.pathname.split('/')[5];
      let f = id ? files.get(id) : null;
      if (f) { f.bytes = new TextEncoder().encode(payload); f.version++; f.name = metadata.name; } else {
        f = { id: `id${++seq}`, name: metadata.name, mimeType: 'application/octet-stream', parents: metadata.parents, bytes: new TextEncoder().encode(payload), version: 1, modifiedTime: 't' };
        files.set(f.id, f);
      }
      return json(meta(f));
    }
    const m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (m && method === 'GET') return new Response(files.get(m[1]).bytes, { status: 200 });
    if (m && method === 'DELETE') { files.delete(m[1]); return new Response(null, { status: 204 }); }
    return new Response('nope', { status: 500 });
  };
  return state;
}

describe('web sign-in helpers', () => {
  it('builds the consent URL with the drive.file scope and the token flow', () => {
    const url = new URL(authUrl({ state: 'abc', redirect: 'https://x.example/app/', clientId: 'cid', loginHint: 'me@example.com' }));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('response_type')).toBe('token');
    expect(url.searchParams.get('scope')).toContain(DRIVE_SCOPE);
    expect(url.searchParams.get('scope')).not.toContain('appdata');
    expect(url.searchParams.get('client_id')).toBe('cid');
    expect(url.searchParams.get('state')).toBe('abc');
    expect(url.searchParams.get('login_hint')).toBe('me@example.com');
  });

  it('reads the answer hash and the redirect address', () => {
    expect(parseAuthHash('#access_token=tok&expires_in=3599&scope=a%20b&state=s')).toEqual({ state: 's', error: null, accessToken: 'tok', expiresIn: 3599, scope: 'a b' });
    expect(parseAuthHash('#error=access_denied&state=s').error).toBe('access_denied');
    expect(parseAuthHash('#/invoices')).toBeNull();
    expect(redirectUri({ origin: 'https://jaffarsk24.github.io', pathname: '/WE-Invoice/app/index.html' })).toBe('https://jaffarsk24.github.io/WE-Invoice/app/');
    expect(grantsDrive(`email ${DRIVE_SCOPE}`)).toBe(true);
    expect(grantsDrive('email')).toBe(false);
  });
});

describe('drive client', () => {
  const client = (api) => createDriveClient({ fetchImpl: api.fetch, getToken: async () => 'tok', randomId: () => 'rnd' });

  it('creates the folder tree on the first write and lists, reads and deletes by path', async () => {
    const api = fakeDrive();
    const drive = client(api);
    expect(await drive.list('')).toEqual([]);
    expect(await drive.get('workspace.json.enc')).toBeNull();
    const saved = await drive.put('c1/data.json.gz.enc', 'hello');
    expect(saved.version).toBe('1');
    const root = Array.from(api.files.values()).find(f => f.name === ROOT_FOLDER);
    expect(root.parents).toEqual(['root']);
    const c1 = Array.from(api.files.values()).find(f => f.name === 'c1');
    expect(c1.parents).toEqual([root.id]);
    const entries = await drive.list('c1');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ name: 'data.json.gz.enc', path: 'c1/data.json.gz.enc', isFolder: false, version: '1' });
    expect((await drive.list('')).map(e => [e.name, e.isFolder])).toEqual([['c1', true]]);
    const got = await drive.get('c1/data.json.gz.enc');
    expect(new TextDecoder().decode(got.bytes)).toBe('hello');
    const again = await drive.put('c1/data.json.gz.enc', new TextEncoder().encode('hello again'));
    expect(again.id).toBe(saved.id);
    expect(again.version).toBe('2');
    expect(await drive.delete('c1/data.json.gz.enc')).toBe(true);
    expect(await drive.delete('c1/data.json.gz.enc')).toBe(false);
    expect(await drive.list('c1/backups')).toEqual([]);
  });

  it('maps failures to codes', async () => {
    const api = fakeDrive();
    const drive = client(api);
    api.fail = 'offline';
    await expect(drive.list('')).rejects.toMatchObject({ code: 'OFFLINE' });
    api.fail = 401;
    await expect(drive.list('')).rejects.toMatchObject({ code: 'RENEW_NEEDED' });
    api.fail = 403;
    await expect(drive.list('')).rejects.toMatchObject({ code: 'DRIVE_SCOPE_MISSING' });
    const noToken = createDriveClient({ fetchImpl: api.fetch, getToken: async () => { throw Object.assign(new Error('x'), { code: 'NOT_SIGNED_IN' }); } });
    await expect(noToken.list('')).rejects.toMatchObject({ code: 'NOT_SIGNED_IN' });
  });
});
