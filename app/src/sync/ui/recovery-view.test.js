// @vitest-environment happy-dom
// The recovery words: "I have it saved" moves on to the check of three
// words, and typing them right confirms the key; closing the check does
// not.
import { describe, it, expect } from 'vitest';
import { showRecoveryWords } from './recovery-view.js';

const WORDS = Array.from({ length: 24 }, (_, i) => `slovo${i + 1}`);

function primary() {
  const dialogs = document.querySelectorAll('.modal-content');
  return dialogs[dialogs.length - 1].querySelector('.modal-actions .btn-primary');
}

describe('recovery words', () => {
  it('confirms the key after the three words are typed', async () => {
    const result = showRecoveryWords({ words: WORDS, positions: [0, 5, 23], transport: {}, showToast: () => {} });
    primary().click();
    const inputs = document.querySelectorAll('.modal-content .sync-input');
    expect(inputs).toHaveLength(3);
    inputs[0].value = 'slovo1';
    inputs[1].value = 'slovo6';
    inputs[2].value = 'Slovo24 ';
    primary().click();
    await expect(result).resolves.toBe(true);
    expect(document.querySelectorAll('.modal-content')).toHaveLength(0);
  });

  it('is not confirmed when the check is closed', async () => {
    const result = showRecoveryWords({ words: WORDS, positions: [1, 2, 3], transport: {}, showToast: () => {} });
    primary().click();
    document.querySelector('.modal-content .modal-header button').click();
    await expect(result).resolves.toBe(false);
  });

  it('is not confirmed when the words are closed unread', async () => {
    const result = showRecoveryWords({ words: WORDS, positions: [1, 2, 3], transport: {}, showToast: () => {} });
    document.querySelector('.modal-content .modal-header button').click();
    await expect(result).resolves.toBe(false);
  });
});
