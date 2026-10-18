// Results for the search dialog of the shell (Ctrl/Cmd+K). The shell
// emits "search:query" with the typed text and its results box; this
// provider fills the box, Enter opens the first hit, and a link leads to
// the search screen with every result.
import { h } from '../../ui/dom.js';
import { topModal } from '../../ui/modal.js';
import { t } from '../../i18n/index.js';
import { navigate } from '../../router.js';
import { search } from './engine.js';
import { renderResults } from './results.js';

export const PALETTE_LIMIT = 8;

function open(route) {
  const modal = topModal();
  if (modal) modal.close();
  if (route) navigate(route);
}

export function searchRoute(query) {
  return `search?q=${encodeURIComponent(query.trim())}`;
}

function bindEnter(box) {
  const input = box.closest('.search-box') && box.closest('.search-box').querySelector('input');
  if (!input || input.dataset.searchEnter) return;
  input.dataset.searchEnter = '1';
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const first = box.querySelector('.search-hit-button');
    if (!first) return;
    e.preventDefault();
    e.stopPropagation();
    open(first.dataset.route);
  });
}

/** Handles one "search:query" event of the shell dialog. */
export function handlePaletteQuery({ query, results }) {
  if (!results) return;
  bindEnter(results);
  let found;
  try {
    found = search(query || '', { limit: PALETTE_LIMIT });
  } catch (e) {
    console.error('Search failed', e);
    while (results.firstChild) results.removeChild(results.firstChild);
    results.append(h('p', { class: 'muted' }, t('errors.UNKNOWN')));
    return;
  }
  renderResults(results, found, { query: query || '', onOpen: open, limitNote: false });
  if (found.total > found.results.length) {
    results.append(h('p', { class: 'search-more' }, h('a', {
      href: `#/${searchRoute(query)}`, onclick: (e) => { e.preventDefault(); open(searchRoute(query)); }
    }, t('search.showAll', { total: found.total }))));
  }
}
