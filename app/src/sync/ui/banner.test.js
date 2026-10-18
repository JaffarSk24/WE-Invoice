// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { createSyncBanner } from './banner.js';

const t = (k) => k;

describe('sync banner', () => {
  it('stays while the web access must be renewed and offers sign-in', () => {
    const el = document.createElement('div');
    const onRenew = vi.fn();
    const banner = createSyncBanner({ el, t, onRenew, onUnlock: vi.fn() });
    banner.update({ status: 'ok' });
    expect(el.hidden).toBe(true);
    banner.update({ status: 'renew' });
    expect(el.hidden).toBe(false);
    expect(el.textContent).toContain('sync.banner.renewText');
    el.querySelector('.btn-primary').click();
    expect(onRenew).toHaveBeenCalled();
  });

  it('asks to unlock encrypted data, hides on "Later" until the status changes', () => {
    const el = document.createElement('div');
    const onUnlock = vi.fn();
    const banner = createSyncBanner({ el, t, onRenew: vi.fn(), onUnlock });
    banner.update({ status: 'locked' });
    el.querySelector('.btn-primary').click();
    expect(onUnlock).toHaveBeenCalled();
    el.querySelector('.btn-secondary').click();
    expect(el.hidden).toBe(true);
    banner.update({ status: 'locked' });
    expect(el.hidden).toBe(true);
    banner.update({ status: 'ok' });
    banner.update({ status: 'locked' });
    expect(el.hidden).toBe(false);
  });
});
