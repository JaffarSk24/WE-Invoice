// Transport of the Electron build: the preload script exposes the bridges
// (wePlatform, weApp, weNet, weSecrets, weMail; weCloud comes with
// WP-SYNC). Network requests go straight from the main process, without
// the gateway and without CORS, to the hosts its allowlist knows. Errors
// of the bridges carry a code the page shows as errors.<CODE>.
import { NotImplementedError } from '@we-invoice/core';
import { createWebTransport } from './web.js';

const notYet = (name) => () => Promise.reject(new NotImplementedError(name));

export class TransportError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'TransportError';
    this.code = code;
  }
}

// weNet answers { status, ok, headers, body: Uint8Array } or { error }.
export function fromNetResponse(result) {
  if (!result || result.error) throw new TransportError((result && result.error && result.error.code) || 'NET_FAILED', result && result.error && result.error.message);
  const bytes = result.body instanceof Uint8Array ? result.body : new Uint8Array(result.body || []);
  const text = () => Promise.resolve(new TextDecoder().decode(bytes));
  return {
    status: result.status,
    ok: result.ok,
    headers: result.headers || {},
    text,
    json: () => text().then(s => JSON.parse(s)),
    bytes: () => Promise.resolve(bytes)
  };
}

// Requests through weNet; a body given as a string or bytes is passed as is.
function httpThroughNet(net) {
  return async ({ url, method = 'GET', headers = {}, body = null, timeoutMs = 30000 }) => {
    const result = await net.request({ url, method, headers, body, timeoutMs });
    return fromNetResponse(result);
  };
}

// weSecrets answers { ok, value } / { ok, stored } / { ok, error }.
function secretsThroughBridge(bridge) {
  const unwrap = (result, pick) => {
    if (!result || !result.ok) throw new TransportError(`SECRETS_${(result && result.error) || 'FAILED'}`);
    return pick(result);
  };
  return {
    get: (name) => bridge.get(name).then(r => unwrap(r, x => x.value)),
    set: (name, value) => bridge.set(name, value).then(r => unwrap(r, x => x.stored)),
    delete: (name) => bridge.delete(name).then(r => unwrap(r, () => true))
  };
}

export function createDesktopTransport(win = window) {
  const web = createWebTransport();
  const os = win.wePlatform && win.wePlatform.os;
  const net = win.weNet;
  const app = win.weApp;
  return {
    ...web,
    platform: os === 'win32' ? 'win' : 'mac',
    http: net && typeof net.request === 'function' ? httpThroughNet(net) : web.http,
    secrets: win.weSecrets ? secretsThroughBridge(win.weSecrets) : { get: notYet('secrets.get'), set: notYet('secrets.set'), delete: notYet('secrets.delete') },
    notify(title, body) {
      if (app && typeof app.notify === 'function') app.notify(title, body).catch(e => console.warn('Notification failed', e));
      else web.notify(title, body);
    }
  };
}
