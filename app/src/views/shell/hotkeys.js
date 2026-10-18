// Global keyboard shortcuts (07-ui-ux-i18n.md § 7.2). The shell handles
// search itself; the others are events for the active screen:
//
//   Ctrl/Cmd+K      search (the shell opens it)
//   N               hotkey:new     a new document on the current screen
//   Ctrl/Cmd+S      hotkey:save
//   Ctrl/Cmd+Enter  hotkey:issue   issue the document
//   Esc             hotkey:escape  (only when no dialog is open: dialogs
//                                   handle Escape themselves)
//
// N is ignored while the user types in a field, so a name with an "n" in
// it never opens anything.
import { topModal } from '../../ui/modal.js';
import { currentRoute } from '../../router.js';

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export function isTypingTarget(target) {
  if (!target || !target.tagName) return false;
  return TYPING_TAGS.has(target.tagName) || target.isContentEditable === true;
}

// Which action a key event means, or null. Pure, so the tests can feed it
// plain objects.
export function hotkeyAction(e, { typing = false, modalOpen = false } = {}) {
  const mod = Boolean(e.ctrlKey || e.metaKey);
  const key = String(e.key || '');
  if (mod && !e.shiftKey && !e.altKey && key.toLowerCase() === 'k') return 'search';
  if (mod && !e.shiftKey && !e.altKey && key.toLowerCase() === 's') return 'save';
  if (mod && key === 'Enter') return 'issue';
  if (key === 'Escape') return modalOpen ? null : 'escape';
  if (!mod && !e.altKey && !e.shiftKey && key.toLowerCase() === 'n' && !typing) return 'new';
  return null;
}

export function initHotkeys({ emit, openSearch, root = document }) {
  root.addEventListener('keydown', (e) => {
    const action = hotkeyAction(e, { typing: isTypingTarget(e.target), modalOpen: Boolean(topModal()) });
    if (!action) return;
    if (action === 'search') { e.preventDefault(); openSearch(); return; }
    if (action === 'save' || action === 'issue') e.preventDefault();
    emit(`hotkey:${action}`, { route: currentRoute(), event: e });
  });
}
