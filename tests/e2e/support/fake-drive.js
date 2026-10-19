// A Google Drive in the memory of the test process, answering the Drive
// API v3 calls of app/src/sync/google/drive-api.js (folders by query,
// multipart uploads, media downloads, deletes) and the Google account
// endpoints. Two browser contexts routed to the same drive are two
// devices of one user. Signing in is skipped: the access token the web
// app keeps after Google's answer is written before the page starts.
const FOLDER = 'application/vnd.google-apps.folder';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS' };
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

export class FakeDrive {
  constructor() {
    this.files = new Map();
    this.seq = 0;
    this.requests = 0;
  }

  meta(file) {
    return { id: file.id, name: file.name, mimeType: file.mimeType, size: String(file.bytes ? file.bytes.length : 0), version: String(file.version), modifiedTime: file.modifiedTime };
  }

  add({ name, mimeType = 'application/octet-stream', parents = ['root'], bytes = null }) {
    const file = { id: `f${++this.seq}`, name, mimeType, parents, bytes, version: 1, modifiedTime: new Date(Date.UTC(2026, 9, 18, 8, 0, this.seq)).toISOString(), trashed: false };
    this.files.set(file.id, file);
    return file;
  }

  // Answers the subset of the query language drive-api.js uses.
  query(q) {
    const name = /name = '((?:\\.|[^'\\])*)'/.exec(q);
    const mime = /mimeType = '([^']+)'/.exec(q);
    const parent = /'([^']+)' in parents/.exec(q);
    const unescape = (s) => s.replace(/\\(.)/g, '$1');
    return [...this.files.values()].filter(f => !f.trashed
      && (!name || f.name === unescape(name[1]))
      && (!mime || f.mimeType === mime[1])
      && (!parent || f.parents.includes(parent[1])))
      .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
  }

  /** Path of a file below the app folder, for the checks of a test. */
  pathOf(file) {
    const parts = [file.name];
    let parentId = file.parents[0];
    while (parentId && parentId !== 'root') {
      const parent = this.files.get(parentId);
      if (!parent) break;
      parts.unshift(parent.name);
      parentId = parent.parents[0];
    }
    return parts.slice(1).join('/');
  }

  /** Every stored file (not folders) as { path, text }. */
  contents() {
    return [...this.files.values()].filter(f => f.mimeType !== FOLDER && !f.trashed).map(f => ({ path: this.pathOf(f), text: Buffer.from(f.bytes || []).toString('latin1') }));
  }
}

function parseMultipart(contentType, body) {
  const boundary = /boundary=([^;]+)/.exec(contentType)[1];
  const sep = Buffer.from(`--${boundary}`);
  const first = body.indexOf(sep);
  const second = body.indexOf(sep, first + sep.length);
  const end = body.indexOf(Buffer.from(`\r\n--${boundary}--`), second);
  const head = body.subarray(first + sep.length, second).toString('utf8');
  const metadata = JSON.parse(head.slice(head.indexOf('\r\n\r\n') + 4).trim());
  const part = body.subarray(second + sep.length, end);
  const start = part.indexOf(Buffer.from('\r\n\r\n')) + 4;
  return { metadata, bytes: Buffer.from(part.subarray(start)) };
}

const reply = (route, status, body, headers = {}) => route.fulfill({
  status, headers: { ...CORS, ...headers },
  contentType: typeof body === 'string' || Buffer.isBuffer(body) ? 'application/octet-stream' : 'application/json',
  body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
});

/** Routes the Google endpoints of a page or a context to the drive. */
export async function routeGoogle(target, drive, { email = 'jan.novak@example.com' } = {}) {
  await target.route(/^https:\/\/(www|oauth2)\.googleapis\.com\//, async (route) => {
    const request = route.request();
    const method = request.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    drive.requests += 1;
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === '/oauth2/v2/userinfo') return reply(route, 200, { email });
    if (path === '/revoke') return reply(route, 200, {});
    const media = /^\/drive\/v3\/files\/([^/]+)$/.exec(path);
    if (path === '/drive/v3/files' && method === 'GET') return reply(route, 200, { files: drive.query(url.searchParams.get('q') || '').map(f => drive.meta(f)) });
    if (path === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(request.postData());
      return reply(route, 200, drive.meta(drive.add({ name: body.name, mimeType: body.mimeType, parents: body.parents })));
    }
    if (media && method === 'GET') {
      const file = drive.files.get(media[1]);
      return file ? reply(route, 200, Buffer.from(file.bytes || [])) : reply(route, 404, { error: { code: 404 } });
    }
    if (media && method === 'DELETE') {
      drive.files.delete(media[1]);
      return route.fulfill({ status: 204, headers: CORS });
    }
    const upload = /^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/.exec(path);
    if (upload) {
      const { metadata, bytes } = parseMultipart(request.headers()['content-type'], request.postDataBuffer());
      if (upload[1]) {
        const file = drive.files.get(upload[1]);
        if (!file) return reply(route, 404, { error: { code: 404 } });
        Object.assign(file, { bytes, version: file.version + 1, modifiedTime: new Date(Date.parse(file.modifiedTime) + 1000).toISOString() });
        return reply(route, 200, drive.meta(file));
      }
      return reply(route, 200, drive.meta(drive.add({ name: metadata.name, parents: metadata.parents, bytes })));
    }
    return reply(route, 404, { error: { code: 404, message: `${method} ${path}` } });
  });
}

/**
 * The web app starts signed in, as after Google's answer. Written once per
 * device, so a sign-out in the test stays signed out after a reload.
 */
export async function signedIn(target, { email = 'jan.novak@example.com' } = {}) {
  await target.addInitScript(({ email, scope }) => {
    if (localStorage.getItem('e2e-signed-in')) return;
    localStorage.setItem('e2e-signed-in', '1');
    localStorage.setItem('we-invoice-web-auth', JSON.stringify({ accessToken: 'e2e-token', expiry: Date.now() + 3600 * 1000, scope }));
    localStorage.setItem('we-invoice-web-account', JSON.stringify({ email }));
  }, { email, scope: `${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email` });
}

/** Signs this device in again (after a sign-out), as Google would answer. */
export async function signInAgain(page, { email = 'jan.novak@example.com' } = {}) {
  await page.evaluate(({ email, scope }) => {
    localStorage.setItem('we-invoice-web-auth', JSON.stringify({ accessToken: 'e2e-token-2', expiry: Date.now() + 3600 * 1000, scope }));
    localStorage.setItem('we-invoice-web-account', JSON.stringify({ email }));
  }, { email, scope: `${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email` });
}

const CONTEXT_OPTIONS = ['viewport', 'userAgent', 'deviceScaleFactor', 'isMobile', 'hasTouch', 'locale', 'baseURL', 'screen'];

/**
 * One more "device": a fresh browser context with the viewport of the
 * running project, routed to the drive and signed in.
 */
export async function newDevice(browser, testInfo, drive, { signIn = true } = {}) {
  const use = testInfo.project.use;
  const options = Object.fromEntries(CONTEXT_OPTIONS.filter(k => use[k] !== undefined).map(k => [k, use[k]]));
  const context = await browser.newContext(options);
  await context.route(/^https?:\/\/(?!localhost)(?!(www|oauth2)\.googleapis\.com)/, route => route.fulfill({ status: 404, headers: CORS, body: '{}' }));
  await routeGoogle(context, drive);
  if (signIn) await signedIn(context);
  const page = await context.newPage();
  return { context, page };
}

const dialog = (page, title) => page.locator('.modal-content[role="dialog"]', { has: page.locator('h3', { hasText: title }) });

/** Answers the first-sync password dialog; returns the 24 recovery words. */
export async function turnOnEncryption(page, password, expect) {
  const setup = dialog(page, 'Heslo na šifrovanie');
  await expect(setup).toBeVisible({ timeout: 15_000 });
  await setup.getByLabel('Heslo (aspoň 8 znakov)').fill(password);
  await setup.getByLabel('Heslo ešte raz').fill(password);
  await setup.getByRole('button', { name: 'Zašifrovať' }).click();
  const recovery = dialog(page, 'Obnovovací kľúč');
  await expect(recovery.locator('.sync-words li')).toHaveCount(24);
  const words = (await recovery.locator('.sync-words li').allInnerTexts()).map(w => w.trim());
  await recovery.getByRole('button', { name: 'Mám ho uložený' }).click();
  const check = dialog(page, 'Overenie kľúča');
  for (const field of await check.locator('.sync-field').all()) {
    const n = Number((await field.locator('label').innerText()).replace(/\D/g, ''));
    await field.locator('input').fill(words[n - 1]);
  }
  await check.getByRole('button', { name: 'Potvrdiť' }).click();
  await expect(page.locator('.toast', { hasText: 'Šifrovanie je zapnuté' })).toBeVisible({ timeout: 15_000 });
  return words;
}

/** Types the password into the unlock dialog of a device without the key. */
export async function unlockWith(page, password, expect) {
  const unlock = dialog(page, 'Zadajte heslo');
  await expect(unlock).toBeVisible({ timeout: 15_000 });
  await unlock.locator('input[type="password"]').fill(password);
  await unlock.getByRole('button', { name: 'Odomknúť' }).click();
  await expect(unlock).toHaveCount(0, { timeout: 15_000 });
}

/** Presses "Synchronizovať" in Settings and waits until the sync is done. */
export async function syncNow(page, drive, expect) {
  await page.goto('./#/settings/sync');
  const before = drive.requests;
  await page.locator('#settings-sync-sync').click();
  // The status reads "syncing" from before the first request until the end.
  await expect.poll(() => drive.requests).toBeGreaterThan(before);
  await expect(page.locator('#settings-sync-status')).toHaveText('Synchronizované', { timeout: 15_000 });
}
