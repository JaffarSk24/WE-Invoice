// The big window about a new version of the desktop app. When the check at
// start (or a later one) finds a newer release, this window opens over the
// app once per version and run: the new and the current version, what is
// new (the release notes from GitHub), and one large "Update now" button.
// It then shows the download progress and "Restart and update", the same
// steps as the banner (desktop/updates.js), which stays as a reminder after
// "Later". "Later" closes the window until the next start.
import { h, clear, icon } from '../ui/dom.js';
import { refreshIcons } from '../ui/icons.js';
import { openModal } from '../ui/modal.js';

// Release notes are short Markdown: headings, list items, bold and links.
// They are drawn as text nodes, never as HTML.
function inlineText(line) {
  return line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim();
}

export function notesView(markdown, emptyText) {
  const lines = String(markdown || '').split(/\r?\n/).map(l => l.trimEnd());
  const nodes = [];
  let list = null;
  for (const line of lines) {
    if (/^#{1,2}\s/.test(line)) { list = null; continue; }
    const heading = /^#{3,6}\s+(.*)$/.exec(line);
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (heading) { list = null; nodes.push(h('h4', {}, inlineText(heading[1]))); } else if (item) {
      if (!list) { list = h('ul', {}); nodes.push(list); }
      list.append(h('li', {}, inlineText(item[1])));
    } else if (line.trim()) { list = null; nodes.push(h('p', {}, inlineText(line))); } else list = null;
  }
  return h('div', { class: 'update-popup-notes' }, nodes.length ? nodes : h('p', { class: 'muted' }, emptyText));
}

export function createUpdatePopup({ updates, t, open = openModal }) {
  const shownFor = new Set();
  let modal = null;
  let body = null;

  function render(state) {
    clear(body);
    const button = (label, onClick, kind, iconName) =>
      h('button', { type: 'button', class: `btn ${kind}`, onclick: onClick }, iconName ? icon(iconName) : null, label);
    body.append(
      h('div', { class: 'update-popup-hero' }, icon('sparkles'),
        h('div', {}, h('p', { class: 'update-popup-lead' }, t('desktop.updates.popupLead', { version: state.latest, current: state.current || '' })),
          h('p', { class: 'muted' }, t('desktop.updates.popupSafe')))),
      h('h3', { class: 'update-popup-subtitle' }, t('desktop.updates.whatsNew')),
      notesView(state.notes, t('desktop.updates.noNotes')));
    const actions = h('div', { class: 'update-popup-actions' });
    if (state.status === 'downloading') {
      const percent = Math.round((state.progress || 0) * 100);
      actions.append(h('div', { class: 'update-popup-progress' },
        h('span', {}, t('desktop.updates.downloading', { percent })),
        h('div', { class: 'update-progress', role: 'progressbar', 'aria-valuenow': String(percent), 'aria-valuemin': '0', 'aria-valuemax': '100' },
          h('div', { class: 'update-progress-bar', style: { width: `${percent}%` } }))));
    } else if (state.status === 'ready') {
      actions.append(h('p', {}, t('desktop.updates.readyLong', { version: state.latest })),
        button(t('desktop.updates.install'), () => updates.install(), 'btn-brand btn-lg', 'rotate-ccw'));
    } else if (state.status === 'installing') {
      actions.append(h('p', {}, t('desktop.updates.installing')));
    } else if (state.status === 'manual') {
      actions.append(h('p', {}, t('desktop.updates.manual')), button(t('common.close'), () => modal && modal.close(), 'btn', null));
    } else {
      actions.append(
        button(t('desktop.updates.updateNow'), () => updates.download(), 'btn-brand btn-lg', 'download'),
        button(t('desktop.updates.later'), () => modal && modal.close(), 'btn-ghost', null));
    }
    body.append(actions);
    refreshIcons(body);
  }

  function show(state) {
    shownFor.add(state.latest);
    body = h('div', { class: 'update-popup' });
    modal = open({ title: t('desktop.updates.popupTitle', { version: state.latest }), body, wide: true, onClose: () => { modal = null; } });
    render(state);
  }

  return updates.onChange((state) => {
    if (modal) { render(state); return; }
    if (state.status === 'available' && state.latest && !shownFor.has(state.latest)) show(state);
  });
}
