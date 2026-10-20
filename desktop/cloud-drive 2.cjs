// Google Drive (API v3, drive.file scope) from the Electron main process:
// the same path-based bridge as app/src/sync/google/drive-api.js, over
// Node's fetch and Buffers. Everything lives under "WE Invoice" in My
// Drive; folder ids are resolved by path and cached. Pure over fetch and
// a token getter, so the tests run it without Electron.
const crypto = require('crypto');

const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,mimeType,size,version,modifiedTime';
const ROOT_FOLDER = 'WE Invoice';
const TIMEOUT_MS = 30000;

function driveError(code, message = code, status = null) {
  const err = new Error(message);
  err.code = code;
  if (status) err.status = status;
  return err;
}

function isNetworkError(e) {
  return e && (e.name === 'TypeError' || e.name === 'TimeoutError' || e.name === 'AbortError'
    || /fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|network/i.test(String(e.message)));
}

const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function entryOf(file, path) {
  return {
    name: file.name, path, id: file.id, isFolder: file.mimeType === FOLDER,
    size: Number(file.size || 0), version: file.version ? String(file.version) : null, modifiedTime: file.modifiedTime || null
  };
}

// `getToken({ force })` resolves an access token (refreshing when needed)
// or throws NOT_SIGNED_IN; `onScopeMissing()` is told about a 403.
function createDriveClient({ fetchImpl = (...a) => fetch(...a), getToken, onScopeMissing = () => {}, rootName = ROOT_FOLDER }) {
  const folders = new Map();

  async function api(url, options = {}) {
    let token = await getToken();
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await fetchImpl(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(options.timeout || TIMEOUT_MS) });
      } catch (e) {
        if (isNetworkError(e)) throw driveError('OFFLINE', e.message);
        throw e;
      }
      if (res.status === 401 && attempt === 0) {
        token = await getToken({ force: true });
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        if (res.status === 403 && /insufficient/i.test(body)) {
          onScopeMissing();
          throw driveError('DRIVE_SCOPE_MISSING', body.slice(0, 200), 403);
        }
        throw driveError('DRIVE_ERROR', `Drive ${res.status}: ${body.slice(0, 200)}`, res.status);
      }
      return res;
    }
    throw driveError('RENEW_NEEDED', 'Google refused the token twice', 401);
  }

  async function query(where) {
    const files = [];
    let pageToken = null;
    do {
      const params = new URLSearchParams({ q: where, fields: `nextPageToken,files(${FIELDS})`, pageSize: '1000', orderBy: 'modifiedTime desc' });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await (await api(`${DRIVE}/files?${params}`)).json();
      files.push(...(data.files || []));
      pageToken = data.nextPageToken || null;
    } while (pageToken);
    return files;
  }

  async function createFolder(name, parentId) {
    const res = await api(`${DRIVE}/files?fields=${FIELDS}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parentId] })
    });
    return (await res.json()).id;
  }

  async function folderId(path, create) {
    if (folders.has(path)) return folders.get(path);
    if (!folders.has('')) {
      const found = await query(`name = '${q(rootName)}' and mimeType = '${FOLDER}' and 'root' in parents and trashed = false`);
      let id = found[0] ? found[0].id : null;
      if (!id && create) id = await createFolder(rootName, 'root');
      if (!id) return null;
      folders.set('', id);
    }
    let parentId = folders.get('');
    let current = '';
    for (const part of path ? path.split('/') : []) {
      current = current ? `${current}/${part}` : part;
      if (!folders.has(current)) {
        const found = await query(`name = '${q(part)}' and mimeType = '${FOLDER}' and '${parentId}' in parents and trashed = false`);
        let id = found[0] ? found[0].id : null;
        if (!id && create) id = await createFolder(part, parentId);
        if (!id) return null;
        folders.set(current, id);
      }
      parentId = folders.get(current);
    }
    return parentId;
  }

  const split = (path) => {
    const i = path.lastIndexOf('/');
    return { folder: i < 0 ? '' : path.slice(0, i), name: i < 0 ? path : path.slice(i + 1) };
  };

  async function find(path) {
    const { folder, name } = split(path);
    const parentId = await folderId(folder, false);
    if (!parentId) return null;
    const found = await query(`name = '${q(name)}' and '${parentId}' in parents and trashed = false`);
    return found[0] || null;
  }

  function multipart(metadata, bytes) {
    const boundary = 'we-invoice-' + crypto.randomBytes(8).toString('hex');
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`;
    return { contentType: `multipart/related; boundary=${boundary}`, body: Buffer.concat([Buffer.from(head), Buffer.from(bytes), Buffer.from(`\r\n--${boundary}--`)]) };
  }

  return {
    async list(folder) {
      const id = await folderId(folder, false);
      if (!id) return [];
      return (await query(`'${id}' in parents and trashed = false`)).map(f => entryOf(f, folder ? `${folder}/${f.name}` : f.name));
    },
    async get(path) {
      const file = await find(path);
      if (!file) return null;
      const res = await api(`${DRIVE}/files/${file.id}?alt=media`, { timeout: 120000 });
      return { bytes: new Uint8Array(await res.arrayBuffer()), id: file.id, version: String(file.version), modifiedTime: file.modifiedTime || null };
    },
    async put(path, data) {
      const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
      const { folder, name } = split(path);
      const parentId = await folderId(folder, true);
      const existing = await find(path);
      const part = existing ? multipart({ name }, bytes) : multipart({ name, parents: [parentId] }, bytes);
      const url = existing ? `${UPLOAD}/files/${existing.id}?uploadType=multipart&fields=${FIELDS}` : `${UPLOAD}/files?uploadType=multipart&fields=${FIELDS}`;
      const res = await api(url, { method: existing ? 'PATCH' : 'POST', headers: { 'Content-Type': part.contentType }, body: part.body, timeout: 120000 });
      const saved = await res.json();
      return { id: saved.id, version: String(saved.version), modifiedTime: saved.modifiedTime || null };
    },
    async delete(path) {
      const file = await find(path);
      if (!file) return false;
      await api(`${DRIVE}/files/${file.id}`, { method: 'DELETE' });
      return true;
    },
    reset() { folders.clear(); }
  };
}

module.exports = { createDriveClient, driveError, isNetworkError, ROOT_FOLDER };
