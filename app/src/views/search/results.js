// One list of search results, shared by the Ctrl/Cmd+K dialog and the
// search screen: grouped by type (documents, received, contacts, items),
// each row a button that opens the record. Text only through h().
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { formatAmount } from '../../components/decimal.js';
import { formatDate } from '../../components/dates.js';
import { routeFor } from './engine.js';

const ICONS = Object.freeze({ document: 'file-text', received: 'file-check', contact: 'users', item: 'boxes' });
export const GROUP_ORDER = Object.freeze(['document', 'received', 'contact', 'item']);

function meta(result) {
  const parts = [];
  if (result.kind && (result.type === 'document' || result.type === 'received')) parts.push(t(`document.kind.${result.kind}`));
  if (result.subtitle) parts.push(result.subtitle);
  if (result.date) parts.push(formatDate(result.date));
  return parts.join(' \u00b7 ');
}

export function resultRow(result, onOpen) {
  const route = routeFor(result);
  const title = result.title || t('search.untitled');
  return h('li', { class: 'search-hit' },
    h('button', {
      type: 'button', class: 'search-hit-button', dataset: { route, type: result.type, id: result.id },
      onclick: () => onOpen(route, result)
    },
    icon(ICONS[result.type] || 'search'),
    h('span', { class: 'search-hit-text' }, h('span', { class: 'search-hit-title' }, title), h('span', { class: 'search-hit-meta muted' }, meta(result))),
    result.amount !== null && result.amount !== undefined && result.type !== 'contact'
      ? h('span', { class: 'search-hit-amount num' }, formatAmount(result.amount, result.currency || 'EUR'))
      : null));
}

/**
 * Draws the results of a search into a container.
 * @param {HTMLElement} container
 * @param {{results: object[], total: number}} found
 * @param {{query: string, onOpen: (route: string, result: object) => void, limitNote?: boolean}} options
 */
export function renderResults(container, found, { query, onOpen, limitNote = true }) {
  while (container.firstChild) container.removeChild(container.firstChild);
  if (!query.trim()) {
    container.append(h('p', { class: 'muted' }, t('search.hint')));
    return;
  }
  if (!found.results.length) {
    container.append(h('p', { class: 'muted search-none' }, t('search.none', { query: query.trim() })));
    return;
  }
  GROUP_ORDER.forEach(type => {
    const rows = found.results.filter(r => r.type === type);
    if (!rows.length) return;
    container.append(h('section', { class: 'search-group', dataset: { type } },
      h('h4', { class: 'search-group-title' }, t(`search.group.${type}`)),
      h('ul', { class: 'search-hits' }, rows.map(r => resultRow(r, onOpen)))));
  });
  if (limitNote && found.total > found.results.length) {
    container.append(h('p', { class: 'muted search-more' }, t('search.more', { shown: found.results.length, total: found.total })));
  }
  refreshIcons(container);
}
