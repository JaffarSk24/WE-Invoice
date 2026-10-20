import { describe, it, expect, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { isAppUrl, isExternalUrl, permissionAllowed, guardContents } = require('./security.cjs');

describe('desktop security', () => {
  it('recognises the app and only the app', () => {
    expect(isAppUrl('app://bundle/index.html#/dashboard')).toBe(true);
    expect(isAppUrl('http://localhost:5173/', 5173)).toBe(true);
    expect(isAppUrl('http://localhost:5173/')).toBe(false);
    expect(isAppUrl('app://evil/x')).toBe(false);
    expect(isAppUrl('file:///etc/passwd')).toBe(false);
    expect(isAppUrl('https://whiteeagles.sk/')).toBe(false);
    expect(isAppUrl('javascript:alert(1)')).toBe(false);
  });

  it('hands only web and mail links to the system', () => {
    expect(isExternalUrl('https://whiteeagles.sk/')).toBe(true);
    expect(isExternalUrl('mailto:a@b.sk')).toBe(true);
    expect(isExternalUrl('file:///Applications/Calculator.app')).toBe(false);
    expect(isExternalUrl('smb://host/share')).toBe(false);
    expect(isExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('allows notifications, clipboard writes and the camera, nothing else', () => {
    expect(permissionAllowed('notifications')).toBe(true);
    expect(permissionAllowed('clipboard-sanitized-write')).toBe(true);
    expect(permissionAllowed('media', { mediaTypes: ['video'] })).toBe(true);
    expect(permissionAllowed('media', { mediaTypes: ['audio'] })).toBe(false);
    expect(permissionAllowed('media', { mediaTypes: ['video', 'audio'] })).toBe(false);
    ['geolocation', 'midi', 'openExternal', 'pointerLock', 'fullscreen', 'display-capture', 'clipboard-read'].forEach(p => expect(permissionAllowed(p)).toBe(false));
  });

  it('refuses foreign navigation and opens links outside', () => {
    const handlers = {};
    let openHandler = null;
    const contents = { on: (name, fn) => { handlers[name] = fn; }, setWindowOpenHandler: (fn) => { openHandler = fn; } };
    const shell = { openExternal: vi.fn() };
    guardContents(contents, { shell, devPort: null });
    const ev = () => ({ preventDefault: vi.fn() });
    const inApp = ev(); handlers['will-navigate'](inApp, 'app://bundle/index.html');
    expect(inApp.preventDefault).not.toHaveBeenCalled();
    const file = ev(); handlers['will-navigate'](file, 'file:///etc/passwd');
    expect(file.preventDefault).toHaveBeenCalled();
    expect(shell.openExternal).not.toHaveBeenCalled();
    const web = ev(); handlers['will-navigate'](web, 'https://whiteeagles.sk/');
    expect(web.preventDefault).toHaveBeenCalled();
    expect(shell.openExternal).toHaveBeenCalledWith('https://whiteeagles.sk/');
    expect(openHandler({ url: 'https://x.sk/' })).toEqual({ action: 'deny' });
    const wv = ev(); handlers['will-attach-webview'](wv);
    expect(wv.preventDefault).toHaveBeenCalled();
  });
});
