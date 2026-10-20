// @vitest-environment happy-dom
// The new version notice: shown for an update of a running app, never for
// the first install (which also takes control of the page).
import { describe, it, expect, beforeEach, vi } from 'vitest';

function fakeWorker() {
  const listeners = [];
  return { state: 'installing', addEventListener: (e, fn) => listeners.push(fn), set: function (s) { this.state = s; listeners.forEach(fn => fn()); } };
}

function fakeRegistration(worker) {
  const listeners = [];
  return { installing: worker, addEventListener: (e, fn) => listeners.push(fn), found(w) { this.installing = w; listeners.forEach(fn => fn()); } };
}

describe('update notice', () => {
  beforeEach(() => { vi.resetModules(); document.body.innerHTML = ''; });

  it('stays silent on the first install', async () => {
    const { watchForUpdates } = await import('./sw-register.js');
    const worker = fakeWorker();
    watchForUpdates(fakeRegistration(worker), () => false);
    worker.set('activated');
    expect(document.querySelector('.toast')).toBe(null);
  });

  it('offers a reload once when an update arrives', async () => {
    const { watchForUpdates } = await import('./sw-register.js');
    const reg = fakeRegistration(null);
    watchForUpdates(reg, () => true);
    const worker = fakeWorker();
    reg.found(worker);
    worker.set('installed');
    worker.set('activated');
    expect(document.querySelectorAll('.toast')).toHaveLength(1);
    expect(document.querySelector('.toast-action')).toBeTruthy();
  });
});
