// Google sign-in for the web and phone app, ported from WE Budget
// (src/web/cloud-web.js): OAuth for client-side apps with the drive.file
// scope. Google returns a short-lived access token (an hour) in the address
// of the page it redirects to. The sign-in page opens in a window of its
// own, from the tap on the button: in an app installed on the iPhone home
// screen such a window stays inside the app, while a plain redirect would
// leave for Safari, which keeps a separate storage. The window comes back
// to this app's address, stores the token in the shared storage, tells
// the app over a BroadcastChannel and closes.
//
// After an hour the next sync needs a tap to renew access: the same window
// opens, Google answers at once while its session is alive, and the window
// closes. No refresh token ever exists in the browser.
import { GOOGLE_CLIENT_ID } from '../../config.js';
import { randomBytes } from '../crypto.js';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const EMAIL_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';
const AUTH_KEY = 'we-invoice-web-auth';        // { accessToken, expiry, scope }
const ACCOUNT_KEY = 'we-invoice-web-account';  // { email }
const PENDING_KEY = 'we-invoice-web-pending';  // { state, mode, startedAt }
const RESULT_KEY = 'we-invoice-web-result';    // { state, ok, error }
const CHANNEL = 'we-invoice-auth';
const LOGIN_WAIT_MS = 5 * 60 * 1000;

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
}

function write(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { console.warn('Sign-in state could not be stored', e); }
}

function randomState() {
  return Array.from(randomBytes(16), b => b.toString(16).padStart(2, '0')).join('');
}

// The address Google returns to: this app's own page, without index.html,
// query or hash (it must match the redirect URIs of the OAuth client).
export function redirectUri(loc = location) {
  return loc.origin + loc.pathname.replace(/index\.html$/, '');
}

export function authUrl({ state, redirect, clientId = GOOGLE_CLIENT_ID, loginHint = '' }) {
  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: 'token',
    scope: [DRIVE_SCOPE, EMAIL_SCOPE].join(' '), include_granted_scopes: 'true', state
  });
  if (loginHint) params.set('login_hint', loginHint);
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

// Reads Google's answer from the address hash: a token or an error.
export function parseAuthHash(hash) {
  const params = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (!params.has('access_token') && !params.has('error')) return null;
  return {
    state: params.get('state') || '',
    error: params.get('error') || null,
    accessToken: params.get('access_token') || null,
    expiresIn: Number(params.get('expires_in') || 3600),
    scope: params.get('scope') || ''
  };
}

export function grantsDrive(scope) {
  return String(scope || '').split(/\s+/).includes(DRIVE_SCOPE);
}

// Runs first when the page loads. When the page is Google's answer, stores
// the result and tells the app. In the sign-in window it then closes and
// returns true: the app must not start in it. After a plain redirect
// (windows blocked) it returns false and the app goes on in this tab.
export function handleAuthCallback() {
  const answer = parseAuthHash(location.hash);
  if (!answer) return false;
  const pending = read(PENDING_KEY);
  history.replaceState(null, '', location.pathname + location.search);
  if (!pending || pending.state !== answer.state) return false;
  let result;
  if (answer.error) result = { state: answer.state, ok: false, error: answer.error === 'access_denied' ? 'SIGN_IN_CANCELLED' : 'SIGN_IN_FAILED' };
  else if (!grantsDrive(answer.scope)) result = { state: answer.state, ok: false, error: 'DRIVE_SCOPE_MISSING' };
  else {
    write(AUTH_KEY, { accessToken: answer.accessToken, expiry: Date.now() + answer.expiresIn * 1000, scope: answer.scope });
    result = { state: answer.state, ok: true };
  }
  write(RESULT_KEY, result);
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage(result);
    channel.close();
  } catch (e) { /* the app also polls the storage */ }
  if (pending.mode !== 'window') return false;
  setTimeout(() => { try { window.close(); } catch (e) { /* not closable */ } }, 50);
  return true;
}

export function tokenInfo() {
  const auth = read(AUTH_KEY);
  return auth && auth.accessToken ? auth : null;
}

export function validToken() {
  const auth = tokenInfo();
  return auth && Date.now() < auth.expiry - 60 * 1000 ? auth.accessToken : null;
}

// A 401 from the API: the token is dead before its time.
export function dropToken() {
  const auth = tokenInfo();
  if (auth) write(AUTH_KEY, { ...auth, expiry: 0 });
}

let waiting = null;

// Opens Google's sign-in in a window of its own (from the tap) and waits
// for the answer. Falls back to leaving the page when windows are blocked.
function signInWindow() {
  if (waiting) return waiting;
  const state = randomState();
  write(RESULT_KEY, null);
  const account = read(ACCOUNT_KEY);
  const url = authUrl({ state, redirect: redirectUri(), loginHint: account && account.email ? account.email : '' });
  const popup = window.open('about:blank', 'we-invoice-auth');
  if (!popup) {
    write(PENDING_KEY, { state, mode: 'redirect', startedAt: Date.now() });
    location.assign(url);
    return new Promise(() => {});
  }
  write(PENDING_KEY, { state, mode: 'window', startedAt: Date.now() });
  popup.location.href = url;
  waiting = new Promise(resolve => {
    let channel = null;
    const started = Date.now();
    const finish = (result) => {
      clearInterval(poll);
      if (channel) channel.close();
      write(PENDING_KEY, null);
      waiting = null;
      try { if (!popup.closed) popup.close(); } catch (e) { /* already gone */ }
      resolve(result);
    };
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (event) => { if (event.data && event.data.state === state) finish(event.data); };
    } catch (e) { channel = null; }
    let closedSince = 0;
    const poll = setInterval(() => {
      const result = read(RESULT_KEY);
      if (result && result.state === state) return finish(result);
      if (Date.now() - started > LOGIN_WAIT_MS) return finish({ ok: false, error: 'SIGN_IN_FAILED' });
      let closed;
      try { closed = popup.closed; } catch (e) { closed = false; }
      if (closed) {
        closedSince = closedSince || Date.now();
        if (Date.now() - closedSince > 3000) finish({ ok: false, error: 'SIGN_IN_CANCELLED' });
      }
    }, 400);
  });
  return waiting;
}

async function fetchEmail(fetchImpl) {
  const res = await fetchImpl('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${validToken()}` } });
  const data = await res.json();
  return data.email || '';
}

function authError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

// transport.auth of the web build.
export function createWebAuth({ fetchImpl = (...a) => fetch(...a) } = {}) {
  return {
    async status() {
      const account = read(ACCOUNT_KEY);
      return { signedIn: Boolean(account && account.email), email: (account && account.email) || '', tokenValid: Boolean(validToken()), configured: Boolean(GOOGLE_CLIENT_ID) };
    },
    async signIn() {
      if (!GOOGLE_CLIENT_ID) throw authError('NOT_CONFIGURED');
      const result = await signInWindow();
      if (!result.ok) throw authError(result.error || 'SIGN_IN_FAILED');
      const email = await fetchEmail(fetchImpl).catch(() => (read(ACCOUNT_KEY) || {}).email || '');
      write(ACCOUNT_KEY, { email });
      return { email };
    },
    async signOut() {
      const auth = tokenInfo();
      write(AUTH_KEY, null);
      write(ACCOUNT_KEY, null);
      if (auth && auth.accessToken) {
        try {
          await fetchImpl('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(auth.accessToken), { method: 'POST', mode: 'no-cors' });
        } catch (e) { /* offline: the local sign-out still stands */ }
      }
    },
    // The token for a Drive call: a tap renews it after the hour.
    async getAccessToken() {
      const token = validToken();
      if (token) return token;
      throw authError(read(ACCOUNT_KEY) ? 'RENEW_NEEDED' : 'NOT_SIGNED_IN');
    }
  };
}
