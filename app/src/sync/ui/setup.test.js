// @vitest-environment happy-dom
// The encryption dialog tells its caller (the wizard) how it ended.
import { describe, it, expect, afterEach } from 'vitest';
import { openSetupModal } from './setup.js';

afterEach(() => { document.body.innerHTML = ''; });

describe('encryption setup dialog', () => {
  it('reports false when the person chooses Later', () => {
    const results = [];
    openSetupModal({ engine: {}, transport: {}, showToast: () => {}, showError: () => {}, onFinish: (ok) => results.push(ok) });
    const buttons = Array.from(document.querySelectorAll('.modal-actions button'));
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    expect(results).toEqual([false]);
    expect(document.querySelector('.modal-content')).toBeNull();
  });

  it('refuses a short password without finishing', () => {
    const results = [];
    openSetupModal({ engine: {}, transport: {}, showToast: () => {}, showError: () => {}, onFinish: (ok) => results.push(ok) });
    document.querySelector('input[type="password"]').value = 'short';
    document.querySelectorAll('.modal-actions button')[1].click();
    expect(results).toEqual([]);
    expect(document.querySelector('.modal-content')).not.toBeNull();
  });
});
