// Transport of the Electron build: the preload script exposes the bridges
// (wePlatform, weApp, weCloud; weNet, weSecrets, weMail come with
// WP-DESKTOP). Network requests go straight from the main process, without
// the gateway and without CORS. Google sign-in and Drive run in the main
// process (desktop/cloud.cjs); every bridge answer is { ok, ... } and a
// failure becomes an Error with its code here.
import { NotImplementedError } from '@we-invoice/core';
import { createWebTransport } from './web.js';

const notYet = (name) => () => Promise.reject(new NotImplementedError(name));

function unwrap(result) {
  if (!result || result.ok === false) {
    const err = new Error((result && result.message) || 'Bridge call failed');
    err.code = (result && result.code) || 'DRIVE_ERROR';
    throw err;
  }
  return result;
}

export function cloudTransport(cloud, texts = () => ({})) {
  return {
    auth: {
      status: async () => { const r = unwrap(await cloud.status()); return { signedIn: r.signedIn, email: r.email, configured: r.configured }; },
      signIn: async () => { const r = unwrap(await cloud.signIn(texts())); return { email: r.email }; },
      signOut: async () => { unwrap(await cloud.signOut()); },
      getAccessToken: async () => unwrap(await cloud.getAccessToken()).token
    },
    drive: {
      list: async (folder) => unwrap(await cloud.list(folder)).entries,
      get: async (file) => {
        const r = unwrap(await cloud.get(file)).file;
        return r ? { ...r, bytes: r.bytes instanceof Uint8Array ? r.bytes : new Uint8Array(r.bytes) } : null;
      },
      put: async (file, data) => unwrap(await cloud.put(file, data)).saved,
      delete: async (file) => unwrap(await cloud.delete(file)).deleted
    }
  };
}

export function createDesktopTransport(win = window, { signInTexts = () => ({}) } = {}) {
  const web = createWebTransport();
  const os = win.wePlatform && win.wePlatform.os;
  const net = win.weNet;
  const cloud = win.weCloud ? cloudTransport(win.weCloud, signInTexts) : null;
  return {
    ...web,
    platform: os === 'win32' ? 'win' : 'mac',
    http: net && typeof net.request === 'function' ? (request) => net.request(request) : web.http,
    auth: cloud ? cloud.auth : web.auth,
    drive: cloud ? cloud.drive : web.drive,
    secrets: win.weSecrets || { get: notYet('secrets.get'), set: notYet('secrets.set'), delete: notYet('secrets.delete') }
  };
}
