// The start screen of index.html while the app starts: the bar shows how
// far the start has come and the line under it what is being done, such as
// opening the data or waiting for Google Drive on a new device. The first
// drawing of the app replaces the whole screen.

/** Moves the bar to `fraction` (0..1) and names the step; no-op once the app is drawn. */
export function bootStep(fraction, text = null, doc = typeof document === 'undefined' ? null : document) {
  const bar = doc && doc.getElementById('boot-bar');
  if (!bar) return;
  bar.style.width = `${Math.round(Math.max(0.08, Math.min(1, fraction)) * 100)}%`;
  if (text !== null) {
    const step = doc.getElementById('boot-step');
    if (step) step.textContent = text;
  }
}
