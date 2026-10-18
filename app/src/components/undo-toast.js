// A toast with Undo for reversible actions (deleting a draft, marking a
// payment): the action is committed only when the toast goes away without
// Undo. `commit` runs once, after the delay or when the page is left.
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/index.js';

export const UNDO_DELAY_MS = 6000;

// Pure state machine, so the timing can be tested without a DOM.
export function createUndoable({ commit, revert = null }) {
  let state = 'pending';
  return {
    get state() { return state; },
    undo() {
      if (state !== 'pending') return false;
      state = 'undone';
      if (revert) revert();
      return true;
    },
    settle() {
      if (state !== 'pending') return false;
      state = 'committed';
      commit();
      return true;
    }
  };
}

const open = new Set();

// Commits everything still pending (the page is being left).
export function flushUndoables() {
  open.forEach(u => u.settle());
  open.clear();
}

export function showUndoToast(message, { commit, revert = null, duration = UNDO_DELAY_MS } = {}) {
  const undoable = createUndoable({ commit, revert });
  open.add(undoable);
  let dismiss = null;
  const timer = setTimeout(() => { undoable.settle(); open.delete(undoable); if (dismiss) dismiss(); }, duration);
  dismiss = showToast(message, {
    type: 'info', duration: duration + 500, actionLabel: t('common.undo'),
    onAction: () => { clearTimeout(timer); undoable.undo(); open.delete(undoable); }
  });
  return undoable;
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flushUndoables);
