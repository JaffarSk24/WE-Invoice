// An empty screen explains itself and offers one main action
// (07-ui-ux-i18n.md § 7.4): "No invoices yet. Issue the first one in a
// minute." plus a button.
import { h, icon } from '../ui/dom.js';

export function emptyState({ title, text = null, iconName = 'inbox', actionLabel = null, onAction = null, actionIcon = 'plus', brand = false }) {
  const action = actionLabel && onAction
    ? h('button', { type: 'button', class: `btn ${brand ? 'btn-brand' : 'btn-primary'}`, onclick: onAction }, icon(actionIcon), actionLabel)
    : null;
  return h('div', { class: 'empty-state', role: 'status' },
    icon(iconName), h('h2', {}, title), text ? h('p', {}, text) : null, action);
}
