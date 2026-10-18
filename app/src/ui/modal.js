// Modal dialogs, ported from WE Budget: a stack, Escape closes the top one,
// Enter presses its primary button, focus moves into the dialog and back.
import { h, icon } from './dom.js';
import { refreshIcons } from './icons.js';
import { t } from '../i18n/index.js';

let stack = [];

export function openModal({ title, body, actions = [], wide = false, onClose = null }) {
  const opener = document.activeElement;
  const overlay = h('div', { class: 'modal-overlay' });
  const titleId = `modal-title-${Date.now()}`;
  const content = h('div', { class: `modal-content ${wide ? 'modal-wide' : ''}`.trim(), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
  const close = () => {
    overlay.remove();
    stack = stack.filter(m => m !== api);
    if (opener && typeof opener.focus === 'function') opener.focus();
    if (onClose) onClose();
  };
  const header = h('div', { class: 'modal-header' },
    h('h3', { id: titleId }, title),
    h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': t('common.close'), onclick: close }, icon('x')));
  const footer = h('div', { class: 'modal-actions' });
  actions.forEach(a => {
    const cls = a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : '';
    const btn = h('button', { type: 'button', class: `btn ${cls}`.trim(), onclick: () => a.onClick(api) }, a.label);
    if (a.kind === 'primary' || a.kind === 'danger') btn.dataset.primary = '1';
    footer.appendChild(btn);
  });
  content.append(header, h('div', { class: 'modal-body' }, body));
  if (actions.length) content.append(footer);
  overlay.appendChild(content);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  const api = { close, overlay, content, footer };
  stack.push(api);
  refreshIcons(content);
  const first = content.querySelector('[autofocus], input, select, textarea, .modal-actions button');
  if (first) setTimeout(() => first.focus(), 30);
  return api;
}

export function topModal() {
  return stack[stack.length - 1] || null;
}

export function initModalKeys() {
  document.addEventListener('keydown', (e) => {
    const m = topModal();
    if (!m) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      m.close();
    } else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
      const primary = m.footer.querySelector('[data-primary]');
      if (primary) { e.preventDefault(); primary.click(); }
    }
  }, true);
}

export function confirmDialog(message, { okLabel = null, danger = false, title = null } = {}) {
  return new Promise(resolve => {
    let answered = false;
    openModal({
      title: title || t('common.confirmTitle'),
      body: h('p', {}, message),
      onClose: () => { if (!answered) resolve(false); },
      actions: [
        { label: t('common.cancel'), onClick: (m) => m.close() },
        { label: okLabel || t('common.ok'), kind: danger ? 'danger' : 'primary', onClick: (m) => { answered = true; resolve(true); m.close(); } }
      ]
    });
  });
}
