import { describe, it, expect, vi } from 'vitest';
import { createUpdates } from './updates.js';

const t = (key, params) => `${key}${params ? ':' + JSON.stringify(params) : ''}`;

function setup(bridge) {
  const toasts = [];
  const errors = [];
  const weUpdates = { onProgress: vi.fn(), check: vi.fn(), download: vi.fn(), install: vi.fn(), ...bridge };
  const updates = createUpdates({ weUpdates, t, showToast: (m, o) => toasts.push({ m, o }), showError: (e) => errors.push(e), setTimer: (fn) => fn() });
  return { updates, weUpdates, toasts, errors };
}

describe('updates', () => {
  it('says nothing at start when there is no update, and reports on request', async () => {
    const { updates, toasts } = setup({ check: async () => ({ ok: true, available: false, latest: '1.0.0' }) });
    await updates.check({ quiet: true });
    expect(toasts).toEqual([]);
    await updates.check();
    expect(toasts[0].m).toBe('desktop.updates.upToDate');
    expect(updates.state().status).toBe('idle');
  });

  it('offers the download, then the install, and installs', async () => {
    const { updates, weUpdates, toasts } = setup({
      check: async () => ({ ok: true, available: true, latest: '1.1.0' }),
      download: async () => ({ ok: true, inPlace: true, verified: true }),
      install: vi.fn(async () => ({ ok: true, quit: true }))
    });
    updates.start();
    expect(weUpdates.onProgress).toHaveBeenCalled();
    await new Promise(r => setTimeout(r, 0));
    expect(updates.state().status).toBe('available');
    expect(toasts[0].m).toBe('desktop.updates.available:{"version":"1.1.0"}');
    expect(toasts[0].o.actionLabel).toBe('desktop.updates.download');
    await toasts[0].o.onAction();
    expect(updates.state().status).toBe('ready');
    expect(toasts[1].o.actionLabel).toBe('desktop.updates.install');
    await toasts[1].o.onAction();
    expect(weUpdates.install).toHaveBeenCalled();
  });

  it('reports a failed check and a failed download', async () => {
    const { updates, toasts } = setup({
      check: async () => ({ ok: false, error: 'offline' }),
      download: async () => ({ ok: false, error: 'checksum_mismatch' })
    });
    await updates.check();
    expect(toasts[0].m).toBe('desktop.updates.failed');
    await updates.download();
    expect(toasts[1].m).toBe('desktop.updates.downloadFailed');
    expect(updates.state().status).toBe('failed');
  });

  it('tells the user when the update has to be dragged over by hand', async () => {
    const { updates, toasts } = setup({ install: async () => ({ ok: true, quit: false, manual: true }) });
    await updates.install();
    expect(toasts[0].m).toBe('desktop.updates.manual');
  });

  it('tracks the progress for the settings screen', () => {
    let progress = null;
    const { updates } = setup({ onProgress: (cb) => { progress = cb; }, check: async () => ({ ok: true, available: false }) });
    const seen = [];
    updates.onChange(s => seen.push(s.progress));
    updates.start();
    progress(0.5);
    expect(seen.at(-1)).toBe(0.5);
    expect(updates.state().progress).toBe(0.5);
  });

  it('is inert without the bridge', async () => {
    const updates = createUpdates({ weUpdates: null, t, showToast() {}, showError() {} });
    updates.start();
    expect(await updates.check()).toBe(null);
  });
});
