// Keeps a screen current: it redraws when the data, the company or the
// demo mode change, once per burst of events, and stops listening as soon
// as the screen is no longer on the page.
import { on } from '../../../events.js';

const EVENTS = ['data:changed', 'company:switched', 'demo:enabled', 'demo:disabled'];

export function keepFresh(root, redraw) {
  let queued = false;
  const offs = EVENTS.map(ev => on(ev, () => {
    if (!root.isConnected) { offs.forEach(off => off()); return; }
    if (queued) return;
    queued = true;
    Promise.resolve().then(() => { queued = false; if (root.isConnected) redraw(); });
  }));
  return () => offs.forEach(off => off());
}
