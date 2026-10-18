// Transport of the Electron build: the preload script exposes the bridges
// (wePlatform, weApp; weNet, weCloud, weSecrets, weMail come with
// WP-DESKTOP and WP-SYNC). Network requests go straight from the main
// process, without the gateway and without CORS.
import { NotImplementedError } from '@we-invoice/core';
import { createWebTransport } from './web.js';

const notYet = (name) => () => Promise.reject(new NotImplementedError(name));

export function createDesktopTransport(win = window) {
  const web = createWebTransport();
  const os = win.wePlatform && win.wePlatform.os;
  const net = win.weNet;
  return {
    ...web,
    platform: os === 'win32' ? 'win' : 'mac',
    http: net && typeof net.request === 'function' ? (request) => net.request(request) : web.http,
    secrets: win.weSecrets || { get: notYet('secrets.get'), set: notYet('secrets.set'), delete: notYet('secrets.delete') }
  };
}
