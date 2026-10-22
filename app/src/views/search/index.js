// The search screen (#/search?q=...): the same search as the Ctrl/Cmd+K
// dialog with every result, narrowed by type. The query stays in the
// address, so the browser's back button returns to the same results.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { navigate } from '../../router.js';
import { on } from '../../events.js';
import { search } from './engine.js';
import { renderResults, GROUP_ORDER } from './results.js';
import '../../style/reports.css';

export const PAGE_LIMIT = 200;

/** The query of a "#/search?q=..." address. */
export function queryFromHash(hash) {
  const at = String(hash || '').indexOf('?');
  if (at < 0) return '';
  return new URLSearchParams(String(hash).slice(at + 1)).get('q') || '';
}

let offs = [];

export function renderSearch(root) {
  offs.forEach(off => off());
  offs = [];
  let query = queryFromHash(window.location.hash);
  let type = '';
  const input = h('input', {
    type: 'search', class: 'search-input', id: 'search-page-input', value: query, autocomplete: 'off', spellcheck: 'false',
    placeholder: t('search.placeholder'), 'aria-label': t('search.placeholder')
  });
  const results = h('div', { class: 'search-results search-page-results', 'aria-live': 'polite' });
  const types = h('div', { class: 'segmented', role: 'group', 'aria-label': t('search.types') });

  const draw = () => {
    let found;
    try {
      found = search(query, { limit: PAGE_LIMIT, types: type ? [type] : undefined });
    } catch (e) {
      console.error('Search failed', e);
      found = { results: [], total: 0, counts: {} };
    }
    while (types.firstChild) types.removeChild(types.firstChild);
    [''].concat(GROUP_ORDER).forEach(id => types.append(h('button', {
      type: 'button', class: 'segment', 'aria-pressed': type === id ? 'true' : 'false', dataset: { type: id || 'all' },
      onclick: () => { type = id; draw(); }
    }, id ? t(`search.group.${id}`) : t('search.all'))));
    renderResults(results, found, { query, onOpen: (route) => navigate(route) });
  };

  let timer = null;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = input.value;
      history.replaceState(null, '', `#/search${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`);
      draw();
    }, 120);
  });
  root.append(
    h('header', { class: 'view-header' }, h('h1', {}, t('search.title'))),
    h('div', { class: 'card search-page' }, h('div', { class: 'search-field' }, icon('search'), input), types, results));
  refreshIcons(root);
  draw();
  ['data:changed', 'company:switched'].forEach(ev => offs.push(on(ev, () => { if (results.isConnected) draw(); })));
  setTimeout(() => input.focus(), 0);
}
