// The global search dialog (Ctrl/Cmd+K). For now it is the frame only: a
// field with a placeholder and a hint. The document packages will plug
// their providers in through the search:query event.
import { h, icon } from '../../ui/dom.js';
import { openModal, topModal } from '../../ui/modal.js';
import { t } from '../../i18n/index.js';
import { emit } from '../../events.js';

let openDialog = null;

export function openSearch() {
  if (openDialog && topModal() === openDialog) return openDialog;
  const input = h('input', {
    type: 'search', id: 'global-search', class: 'search-input', placeholder: t('search.placeholder'),
    'aria-label': t('search.placeholder'), autocomplete: 'off', spellcheck: 'false', autofocus: true
  });
  const results = h('div', { class: 'search-results', id: 'global-search-results', 'aria-live': 'polite' },
    h('p', { class: 'muted' }, t('search.hint')));
  input.addEventListener('input', () => emit('search:query', { query: input.value, results }));
  openDialog = openModal({
    title: t('search.title'),
    body: h('div', { class: 'search-box' }, h('div', { class: 'search-field' }, icon('search'), input), results),
    onClose: () => { openDialog = null; }
  });
  return openDialog;
}
