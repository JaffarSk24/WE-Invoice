// Google sign-in and the Drive bridge of the desktop app, ported from
// WE Budget main/cloud.cjs. Runs in the main process; the page reaches it
// as window.weCloud (preload.cjs) and app/src/transport/desktop.js turns
// its answers into the transport contract.
//
// - The app ships with its own OAuth client (oauth-credentials.json,
//   { clientId, clientSecret }, bundled into the package but kept out of
//   the repository; a google-credentials.json in userData overrides it).
//   For installed apps the client secret is not a secret: it only lets
//   the app ask a user for consent.
// - Sign-in is the authorization code flow with PKCE and a loopback
//   redirect on a random local port, opened in the system browser. The
//   refresh token is kept in userData (owner-only file).
// - Drive access is the drive.file scope, the folder "WE Invoice".
// Every bridge call answers { ok: true, ... } or { ok: false, code,
// message }: an IPC rejection would lose the error code.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { createDriveClient, isNetworkError } = require('./cloud-drive.cjs');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const SCOPES = `${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`;
const TIMEOUT_MS = 30000;
const LOGIN_WAIT_MS = 5 * 60 * 1000;

function grantsDrive(scope) {
  return !scope || String(scope).split(/\s+/).includes(DRIVE_SCOPE);
}

function page(title, message) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#090b11;color:#e2e8f0">
<div style="background:#161a26;padding:40px;border-radius:16px;max-width:420px;text-align:center"><h2 style="margin:0 0 12px">${title}</h2>
<p style="color:#94a3b8;font-size:14px;margin:0;line-height:1.5">${message}</p></div></body></html>`;
}

function fail(e) {
  return { ok: false, code: (e && e.code) || (isNetworkError(e) ? 'OFFLINE' : 'DRIVE_ERROR'), message: String((e && e.message) || e) };
}

class Cloud {
  // `electron` is injected so the tests can run without it; `pages` holds
  // the texts of the browser page after sign-in (from the dictionary).
  constructor({ electron = null, fetchImpl = (...a) => fetch(...a), userData, bundledDir = path.join(__dirname, '..') }) {
    this.electron = electron;
    this.fetchImpl = fetchImpl;
    this.tokensPath = path.join(userData, 'google-tokens.json');
    const override = this.readJson(path.join(userData, 'google-credentials.json'));
    const bundled = this.readJson(path.join(bundledDir, 'oauth-credentials.json'));
    this.credentials = [override, bundled].find(c => c && c.clientId && c.clientSecret) || null;
    this.tokens = this.readJson(this.tokensPath);
    this.server = null;
    this.drive = createDriveClient({ fetchImpl, getToken: (o) => this.accessToken(o || {}) });
  }

  readJson(file) {
    try {
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error('[cloud] cannot read', path.basename(file), e.message);
    }
    return null;
  }

  // Tokens are readable by the owner only.
  writeJson(file, data) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  isConfigured() { return Boolean(this.credentials); }
  isSignedIn() { return Boolean(this.tokens && this.tokens.refresh_token); }

  status() {
    return { ok: true, configured: this.isConfigured(), signedIn: this.isSignedIn(), email: (this.tokens && this.tokens.email) || '' };
  }

  openExternal(url) {
    if (this.electron && this.electron.shell) this.electron.shell.openExternal(url);
    else console.warn('[cloud] open in a browser:', url);
  }

  // ---------- OAuth ----------

  signIn(texts = {}) {
    if (!this.isConfigured()) return Promise.resolve({ ok: false, code: 'NOT_CONFIGURED', message: 'No OAuth client' });
    this.cancelSignIn();
    const t = { okTitle: 'Signed in', ok: 'You can close this tab and return to WE Invoice.', failTitle: 'Sign-in failed', fail: 'Close this tab and try again from the app.', ...texts };
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        this.cancelSignIn();
        resolve(result);
      };
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname !== '/callback') { res.writeHead(404).end(); return; }
        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const html = (status, title, text) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page(title, text)); };
        if (error || !code || url.searchParams.get('state') !== state) {
          html(400, t.failTitle, t.fail);
          return finish({ ok: false, code: error === 'access_denied' ? 'SIGN_IN_CANCELLED' : 'SIGN_IN_FAILED', message: error || 'invalid_response' });
        }
        try {
          const redirectUri = `http://127.0.0.1:${this.server.address().port}/callback`;
          const data = await this.requestTokens({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri });
          if (!grantsDrive(data.scope)) {
            this.revoke(data.refresh_token || data.access_token);
            html(200, t.failTitle, t.fail);
            return finish({ ok: false, code: 'DRIVE_SCOPE_MISSING', message: 'Drive permission not granted' });
          }
          if (!data.refresh_token) throw new Error('no_refresh_token');
          const email = await this.fetchEmail(data.access_token);
          this.tokens = { access_token: data.access_token, refresh_token: data.refresh_token, expiry: Date.now() + (data.expires_in || 3600) * 1000, email, clientId: this.credentials.clientId, scope: data.scope || SCOPES };
          this.writeJson(this.tokensPath, this.tokens);
          html(200, t.okTitle, t.ok);
          finish({ ok: true, email });
        } catch (e) {
          html(500, t.failTitle, t.fail);
          finish(fail(e));
        }
      });
      this.server.on('error', (e) => finish(fail(e)));
      this.server.listen(0, '127.0.0.1', () => {
        const redirectUri = `http://127.0.0.1:${this.server.address().port}/callback`;
        const params = new URLSearchParams({
          client_id: this.credentials.clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES, include_granted_scopes: 'true',
          access_type: 'offline', prompt: 'consent', code_challenge: challenge, code_challenge_method: 'S256', state
        });
        this.openExternal('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
      });
      setTimeout(() => finish({ ok: false, code: 'SIGN_IN_FAILED', message: 'timeout' }), LOGIN_WAIT_MS).unref();
    });
  }

  cancelSignIn() {
    if (!this.server) return;
    try { this.server.close(); } catch (e) { /* already closed */ }
    this.server = null;
  }

  async requestTokens(params) {
    const res = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.credentials.clientId, client_secret: this.credentials.clientSecret, ...params }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error_description || data.error || `token ${res.status}`), { oauth: data.error });
    return data;
  }

  async fetchEmail(accessToken) {
    try {
      const res = await this.fetchImpl('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      return (await res.json()).email || '';
    } catch (e) {
      return '';
    }
  }

  async revoke(token) {
    if (!token) return;
    try {
      await this.fetchImpl('https://oauth2.googleapis.com/revoke', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token }).toString(), signal: AbortSignal.timeout(10000)
      });
    } catch (e) { /* offline: the local sign-out still stands */ }
  }

  forgetTokens() {
    this.tokens = null;
    try { if (fs.existsSync(this.tokensPath)) fs.unlinkSync(this.tokensPath); } catch (e) { console.error('[cloud] cannot remove tokens', e.message); }
  }

  // A fresh access token; Google may stop honouring the refresh token at
  // any time (access revoked, another OAuth client): then a new sign-in
  // is the only way forward.
  async accessToken({ force = false } = {}) {
    if (!this.isSignedIn()) throw Object.assign(new Error('not signed in'), { code: 'NOT_SIGNED_IN' });
    const sameClient = this.credentials && this.tokens.clientId === this.credentials.clientId;
    if (!force && sameClient && this.tokens.access_token && Date.now() < this.tokens.expiry - 60000) return this.tokens.access_token;
    try {
      const fresh = await this.requestTokens({ grant_type: 'refresh_token', refresh_token: this.tokens.refresh_token });
      this.tokens = { ...this.tokens, access_token: fresh.access_token, scope: fresh.scope || this.tokens.scope, expiry: Date.now() + (fresh.expires_in || 3600) * 1000, clientId: this.credentials.clientId };
      this.writeJson(this.tokensPath, this.tokens);
      return this.tokens.access_token;
    } catch (e) {
      if (e.oauth === 'invalid_grant' || e.oauth === 'unauthorized_client') {
        this.forgetTokens();
        throw Object.assign(new Error('sign-in expired'), { code: 'NOT_SIGNED_IN' });
      }
      if (isNetworkError(e)) throw Object.assign(new Error(e.message), { code: 'OFFLINE' });
      throw e;
    }
  }

  async signOut() {
    const token = this.tokens && (this.tokens.refresh_token || this.tokens.access_token);
    this.forgetTokens();
    this.drive.reset();
    await this.revoke(token);
    return { ok: true };
  }

  // ---------- the bridge (never throws) ----------

  async guard(fn) {
    try { return { ok: true, ...(await fn()) }; } catch (e) { return fail(e); }
  }

  getAccessToken() { return this.guard(async () => ({ token: await this.accessToken() })); }
  list(folder) { return this.guard(async () => ({ entries: await this.drive.list(String(folder || '')) })); }
  get(file) { return this.guard(async () => ({ file: await this.drive.get(String(file)) })); }
  put(file, data) { return this.guard(async () => ({ saved: await this.drive.put(String(file), data) })); }
  delete(file) { return this.guard(async () => ({ deleted: await this.drive.delete(String(file)) })); }
}

// Registers the IPC handlers behind window.weCloud (preload.cjs).
function registerCloudIpc(ipcMain, cloud) {
  ipcMain.handle('cloud:status', () => cloud.status());
  ipcMain.handle('cloud:sign-in', (_e, texts) => cloud.signIn(texts || {}));
  ipcMain.handle('cloud:sign-out', () => cloud.signOut());
  ipcMain.handle('cloud:token', () => cloud.getAccessToken());
  ipcMain.handle('cloud:list', (_e, folder) => cloud.list(folder));
  ipcMain.handle('cloud:get', (_e, file) => cloud.get(file));
  ipcMain.handle('cloud:put', (_e, file, data) => cloud.put(file, data));
  ipcMain.handle('cloud:delete', (_e, file) => cloud.delete(file));
}

module.exports = { Cloud, registerCloudIpc, grantsDrive, DRIVE_SCOPE };
