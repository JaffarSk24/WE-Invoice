import { describe, it, expect, vi } from 'vitest';
import { createCloseRound, initCloseHandshake } from './close.js';

describe('close round', () => {
  it('resolves when every waited promise settles, even a failing one', async () => {
    const round = createCloseRound({ timeoutMs: 1000 });
    round.wait(Promise.resolve(1));
    round.wait(Promise.reject(new Error('sync failed')));
    expect(await round.run()).toBe('done');
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    try {
      const round = createCloseRound({ timeoutMs: 500 });
      round.wait(new Promise(() => {}));
      const result = round.run();
      vi.advanceTimersByTime(500);
      expect(await result).toBe('timeout');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('close handshake', () => {
  it('lets modules finish, then tells the main process', async () => {
    let trigger = null;
    const weApp = { onBeforeClose: (cb) => { trigger = cb; return () => {}; }, closeReady: vi.fn() };
    const order = [];
    const emit = (event, payload) => {
      order.push(event);
      payload.wait(new Promise(resolve => setTimeout(() => { order.push('flushed'); resolve(); }, 5)));
    };
    initCloseHandshake(weApp, emit, { timeoutMs: 1000 });
    await trigger();
    expect(order).toEqual(['app:before-close', 'flushed']);
    expect(weApp.closeReady).toHaveBeenCalledTimes(1);
  });

  it('answers even when a module throws while subscribing', async () => {
    let trigger = null;
    const weApp = { onBeforeClose: (cb) => { trigger = cb; }, closeReady: vi.fn() };
    initCloseHandshake(weApp, () => { throw new Error('boom'); });
    await expect(trigger()).rejects.toThrow('boom');
    expect(weApp.closeReady).toHaveBeenCalledTimes(1);
  });

  it('does nothing without the bridge', () => {
    expect(typeof initCloseHandshake(null, () => {})).toBe('function');
  });
});
