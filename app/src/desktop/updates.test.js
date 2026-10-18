// @vitest-environment happy-dom
// The desktop update flow as in WE Budget: a banner with the new version,
// the download progress, "Restart and update", "Later", a check at start
// and once a day.
import { describe, it, expect, vi } from 'vitest';
import { createUpdates } from './updates.js';

const t = (key, params) => `${key}${params ? ':' + JSON.stringify(params) : ''}`;

function setup(bridge) {
  const toasts = [];
  const errors = [];
  const repeats = [];
  const weUpdates = { onProgress: vi.fn(), check: vi.fn(), download: vi.fn(), install: vi.fn(), ...bridge };
  const updates = createUpdates({
    weUpdates, t, showToast: (m, o) => toasts.push({ m, o }), showError: (e) => errors.push(e),
    setTimer: (fn) => fn(), setRepeat: (fn, ms) => repeats.push({ fn, ms })
  });
  return { updates, weUpdates, toasts, errors, repeats };
}

const flush = () => new Promise(r => setTimeout(r, 0));
const buttons = (el) => Array.from(el.querySelectorAll('button')).map(b => b.textContent);
const click = (el, label) => Array.from(el.querySelectorAll('button')).find(b => b.textContent === label).click();

describe('updates', () => {
  it('says nothing at start when there is no update, and reports on request', async () => {
    const { updates, toasts } = setup({ check: async () => ({ ok: true, available: false, latest: '1.0.0' }) });
    await updates.check({ quiet: true });
    expect(toasts).toEqual([]);
    await updates.check();
    expect(toasts[0].m).toBe('desktop.updates.upToDate');
    expect(updates.state().status).toBe('idle');
  });

  it('shows the banner, downloads with progress and restarts to install', async () => {
    let progress = null;
    const { updates, weUpdates, repeats } = setup({
      onProgress: (fn) => { progress = fn; },
      check: async () => ({ ok: true, available: true, latest: '1.1.0', current: '1.0.0', notes: 'Fixes' }),
      download: vi.fn(async () => { progress(0.5); return { ok: true, inPlace: true, verified: true }; }),
      install: vi.fn(async () => ({ ok: true, quit: true }))
    });
    const banner = document.createElement('div');
    updates.start(banner);
    await flush();
    expect(repeats[0].ms).toBe(24 * 60 * 60 * 1000);
    expect(banner.hidden).toBe(false);
    expect(banner.textContent).toContain('desktop.updates.availableLong:{"version":"1.1.0","current":"1.0.0"}');
    expect(buttons(banner)).toEqual(['desktop.updates.download', 'desktop.updates.whatsNew', 'desktop.updates.later']);
    click(banner, 'desktop.updates.download');
    await flush();
    expect(weUpdates.download).toHaveBeenCalled();
    expect(updates.state().status).toBe('ready');
    expect(buttons(banner)).toEqual(['desktop.updates.install']);
    click(banner, 'desktop.updates.install');
    await flush();
    expect(weUpdates.install).toHaveBeenCalled();
  });

  it('hides the banner after "Later" until a manual check', async () => {
    const { updates } = setup({ check: async () => ({ ok: true, available: true, latest: '1.1.0', current: '1.0.0' }) });
    const banner = document.createElement('div');
    updates.start(banner);
    await flush();
    click(banner, 'desktop.updates.later');
    expect(banner.hidden).toBe(true);
    await updates.check({ quiet: true });
    expect(banner.hidden).toBe(true);
    await updates.check();
    expect(banner.hidden).toBe(false);
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
  });

  it('tells the user when the update has to be dragged over by hand', async () => {
    const { updates, toasts } = setup({ install: async () => ({ ok: true, quit: false, manual: true }) });
    await updates.install();
    expect(toasts[0].m).toBe('desktop.updates.manual');
    expect(updates.state().status).toBe('manual');
  });
});
