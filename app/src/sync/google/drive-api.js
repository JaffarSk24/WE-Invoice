// Google Drive (API v3, drive.file scope) as the path-based bridge of
// remote.js: everything lives under the folder "WE Invoice" in My Drive,
// visible to the user (never appDataFolder: the invoice archive must
// outlive the app). With drive.file the app sees only files it created.
// Folder ids are resolved by path and cached; a missing folder is created
// on the first write. Pure over fetch and a token getter, so the web
// transport and the tests share it.
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER = 'application/vnd.google-apps.folder';
const FIELDS = 'id,name,mimeType,size,version,modifiedTime';
export const ROOT_FOLDER = 'WE Invoice';
const TIMEOUT_MS = 30000;

export function driveError(code, message = code, status = null) {
  const err = new Error(message);
  err.code = code;
  if (status) err.status = status;
  return err;
}

function isNetworkError(e) {
  return e && (e.name === 'TypeError' || e.name === 'TimeoutError' || e.name === 'AbortError'
    || /network|failed to fetch|load failed|fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN/i.test(e.message || ''));
}

const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

function entryOf(file, path) {
  return {
    name: file.name, path, id: file.id, isFolder: file.mimeType === FOLDER,
    size: Number(file.size || 0), version: file.version ? String(file.version) : null, modifiedTime: file.modifiedTime || null
  };
}

// `getToken()` resolves the access token or throws NOT_SIGNED_IN /
// RENEW_NEEDED; `onUnauthorized()` is told about a 401.
export function createDriveClient({ fetchImpl = (...a) => fetch(...a), getToken, onUnauthorized = () => {}, rootName = ROOT_FOLDER, randomId = () => Math.random().toString(16).slice(2) }) {
  const folders = new Map(); // path -> id ('' is the root folder)

  async function api(url, options = {}) {
    const token = await getToken();
    let res;
    try {
      res = await fetchImpl(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(options.timeout || TIMEOUT_MS) });
    } catch (e) {
      if (isNetworkError(e)) throw driveError('OFFLINE', e.message);
      throw e;
    }
    if (res.status === 401) {
      onUnauthorized();
      throw driveError('RENEW_NEEDED', 'Google refused the token', 401);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 403 && /insufficient/i.test(body)) throw driveError('DRIVE_SCOPE_MISSING', body.slice(0, 200), 403);
      throw driveError('DRIVE_ERROR', `Drive ${res.status}: ${body.slice(0, 200)}`, res.status);
    }
    return res;
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

  // The id of a folder path ('' is the app folder); null when it does not
  // exist and `create` is false.
  async function folderId(path, create) {
    if (folders.has(path)) return folders.get(path);
    const parts = path ? path.split('/') : [];
    let parentId;
    let current = '';
    if (!folders.has('')) {
      const found = await query(`name = '${q(rootName)}' and mimeType = '${FOLDER}' and 'root' in parents and trashed = false`);
      let id = found[0] ? found[0].id : null;
      if (!id && create) id = await createFolder(rootName, 'root');
      if (!id) return null;
      folders.set('', id);
    }
    parentId = folders.get('');
    for (const part of parts) {
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
    const boundary = 'we-invoice-' + randomId();
    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`;
    return { contentType: `multipart/related; boundary=${boundary}`, body: new Blob([head, bytes, `\r\n--${boundary}--`]) };
  }

  return {
    async list(folder) {
      const id = await folderId(folder, false);
      if (!id) return [];
      const files = await query(`'${id}' in parents and trashed = false`);
      return files.map(f => entryOf(f, folder ? `${folder}/${f.name}` : f.name));
    },

    async get(path) {
      const file = await find(path);
      if (!file) return null;
      const res = await api(`${DRIVE}/files/${file.id}?alt=media`, { timeout: 120000 });
      return { bytes: new Uint8Array(await res.arrayBuffer()), id: file.id, version: String(file.version), modifiedTime: file.modifiedTime || null };
    },

    async put(path, data) {
      const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
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

    // For tests and a sign-out: forget the cached folder ids.
    reset() { folders.clear(); }
  };
}
