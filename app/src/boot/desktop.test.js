import { describe, it, expect, vi, beforeEach } from 'vitest';
import { boot, createDesktopModule, isDesktopWindow } from './desktop.js';
import { registerRoute } from '../router.js';
import { resetPrefsCache } from '../prefs.js';
import { on, emit } from '../events.js';

function fakeWindow() {
  const listeners = {};
  const listen = (name) => (cb) => { listeners[name] = cb; return () => {}; };
  return {
    listeners,
    wePlatform: { os: 'darwin' },
    weApp: { onBeforeClose: listen('beforeClose'), closeReady: vi.fn(), onDeepLink: listen('deepLink'), pendingLink: vi.fn(async () => null) },
    weTray: { setState: vi.fn(), onAction: listen('trayAction') },
    weScheduler: { onTick: listen('tick') },
    weUpdates: { onProgress: vi.fn(), check: vi.fn(async () => ({ ok: true, available: false })) }
  };
}

function fakeCtx() {
  return {
    t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
    on, emit,
    navigate: vi.fn(),
    showToast: vi.fn(),
    showError: vi.fn(),
    registerRoute: vi.fn()
  };
}

beforeEach(() => { localStorage.clear(); resetPrefsCache(); });

describe('desktop module', () => {
  it('does nothing in the browser', async () => {
    expect(await boot(fakeCtx(), {})).toBe(null);
    expect(isDesktopWindow({ wePlatform: { os: 'darwin' } })).toBe(false);
  });

  it('shows the tray at start and redraws it from the sales summary', async () => {
    const win = fakeWindow();
    const ctx = fakeCtx();
    await boot(ctx, win);
    expect(win.weTray.setState).toHaveBeenCalledTimes(1);
    expect(win.weTray.setState.mock.calls[0][0]).toMatchObject({ show: true, due: '', quit: 'desktop.tray.quit' });
    emit('desktop:tray', { show: true, dueTotal: '10.00', currency: 'EUR', overdueCount: 1, canReceive: true });
    const state = win.weTray.setState.mock.calls[1][0];
    expect(state.due).toMatch(/desktop\.tray\.due:/);
    expect(state.overdue).toBe('desktop.tray.overdue:{"count":1}');
    expect(state.receiveEnabled).toBe(true);
    expect(ctx.registerRoute).toHaveBeenCalledWith('desktop', expect.any(Function));
  });

  it('turns tray actions into navigation and events', async () => {
    const win = fakeWindow();
    const ctx = fakeCtx();
    registerRoute('invoices', () => {});
    const events = [];
    on('invoice:new', (p) => events.push(p));
    await boot(ctx, win);
    win.listeners.trayAction('new-invoice');
    expect(ctx.navigate).toHaveBeenCalledWith('invoices');
    expect(events).toEqual([{ source: 'tray' }]);
    win.listeners.trayAction('bogus');
    expect(ctx.navigate).toHaveBeenCalledTimes(1);
  });

  it('relays scheduler wake-ups and deep links', async () => {
    const win = fakeWindow();
    const ctx = fakeCtx();
    const seen = [];
    on('scheduler:efaktury', (p) => seen.push(p));
    on('app:deep-link', (p) => seen.push(p));
    const module = createDesktopModule(ctx, win);
    module.start();
    win.listeners.tick({ kind: 'efaktury', at: 5 });
    win.listeners.deepLink({ route: 'invoices', path: ['new'], params: {} });
    expect(seen).toEqual([{ at: 5 }, { route: 'invoices', path: ['new'], params: {} }]);
    expect(ctx.navigate).toHaveBeenCalledWith('invoices');
  });

  it('answers the close handshake', async () => {
    const win = fakeWindow();
    await boot(fakeCtx(), win);
    await win.listeners.beforeClose();
    expect(win.weApp.closeReady).toHaveBeenCalled();
  });
});
