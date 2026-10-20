// A small label next to an attachment that says where its file is: waiting
// for the upload, in Google Drive, being taken from it, not uploaded yet
// by the other device, or out of reach. It follows "attachments:status"
// while it is on the page and stops listening once it is removed.
import { h, icon, clear, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { attachmentState, attachmentStateKey } from '../attachments/registry.js';

const ICONS = Object.freeze({ pending: 'hourglass', remote: 'cloud', downloading: 'refresh-cw', notUploaded: 'cloud-alert', offline: 'cloud-off' });

export function attachmentBadge(record, { listen = on } = {}) {
  const el = h('span', { class: 'attachment-state small', role: 'status', dataset: { attachmentId: record.id } });
  function draw() {
    const state = attachmentState(record.id);
    const key = attachmentStateKey(state);
    el.dataset.state = state;
    clear(el);
    el.hidden = !key;
    if (!key) return;
    append(el, [icon(ICONS[state]), h('span', {}, t(key))]);
    refreshIcons(el);
  }
  draw();
  let seen = false;
  const off = listen('attachments:status', (payload) => {
    if (el.isConnected) seen = true;
    else if (seen) { off(); return; }
    if (!payload || payload.id === null || payload.id === record.id) draw();
  });
  return el;
}
