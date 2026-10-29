// @vitest-environment happy-dom
// navigate(): the back button of a card ("#/received/abc" -> "received")
// must leave the card, and the same path again draws the screen again.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerRoute, startRouter, navigate } from './router.js';

describe('navigate', () => {
  const onChange = vi.fn();

  beforeEach(() => {
    registerRoute('received', () => {});
    window.location.hash = '#/received/abc';
    startRouter({ defaultRoute: 'received', onChange });
    onChange.mockClear();
  });

  it('leaves a card for its list', () => {
    navigate('received');
    expect(window.location.hash).toBe('#/received');
  });

  it('drops a filter of the same screen', () => {
    window.location.hash = '#/received?filter=x';
    navigate('received');
    expect(window.location.hash).toBe('#/received');
  });

  it('draws the same path again without a hash change', () => {
    navigate('received/abc');
    expect(window.location.hash).toBe('#/received/abc');
    expect(onChange).toHaveBeenCalledWith('received', expect.any(Function));
  });
});
