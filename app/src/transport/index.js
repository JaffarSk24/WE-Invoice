// Picks the transport for where the app runs: the desktop preload exposes
// window.wePlatform; anything else is the web build.
import { assertTransport } from './interface.js';
import { createWebTransport } from './web.js';
import { createDesktopTransport } from './desktop.js';

let instance = null;

export function isDesktop(win = window) {
  return Boolean(win && win.wePlatform);
}

export function getTransport() {
  if (!instance) instance = assertTransport(isDesktop() ? createDesktopTransport() : createWebTransport());
  return instance;
}
