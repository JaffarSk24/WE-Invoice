// A search field with suggestions (WAI-ARIA combobox): typing asks
// `search(query)` for items, arrows move through them, Enter picks one,
// Escape closes. `search` may be sync or async and returns
// [{ id, label, hint? }].
import { h } from '../ui/dom.js';

let counter = 0;

export function autocomplete({ label, placeholder = null, search, onPick, minLength = 1, value = '', hint = null }) {
  const id = `ac-${++counter}`;
  const listId = `${id}-list`;
  const input = h('input', {
    type: 'text', id, value, placeholder, autocomplete: 'off', spellcheck: 'false', role: 'combobox',
    'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': listId, 'aria-haspopup': 'listbox'
  });
  const list = h('ul', { class: 'ac-list', id: listId, role: 'listbox', hidden: true });
  let items = [];
  let activeIndex = -1;
  let ticket = 0;

  const close = () => {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    activeIndex = -1;
  };
  const pick = (index) => {
    const item = items[index];
    if (!item) return;
    input.value = item.label;
    close();
    onPick(item);
  };
  const highlight = (index) => {
    activeIndex = index;
    Array.from(list.children).forEach((li, i) => {
      li.setAttribute('aria-selected', i === index ? 'true' : 'false');
      li.classList.toggle('is-active', i === index);
    });
    if (index >= 0) input.setAttribute('aria-activedescendant', `${id}-opt-${index}`);
    else input.removeAttribute('aria-activedescendant');
  };
  const render = () => {
    while (list.firstChild) list.removeChild(list.firstChild);
    items.forEach((item, i) => list.append(h('li', {
      id: `${id}-opt-${i}`, role: 'option', 'aria-selected': 'false', class: 'ac-item',
      onmousedown: (e) => { e.preventDefault(); pick(i); }
    }, h('span', { class: 'ac-label' }, item.label), item.hint ? h('span', { class: 'ac-hint' }, item.hint) : null)));
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
    highlight(-1);
  };
  const run = async () => {
    const query = input.value.trim();
    const my = ++ticket;
    if (query.length < minLength) { items = []; render(); return; }
    try {
      const found = await search(query);
      if (my !== ticket) return;
      items = Array.isArray(found) ? found : [];
      render();
    } catch (e) {
      console.error('Suggestions failed', e);
      items = [];
      render();
    }
  };
  input.addEventListener('input', run);
  input.addEventListener('focus', () => { if (input.value.trim().length >= minLength) run(); });
  input.addEventListener('blur', close);
  input.addEventListener('keydown', (e) => {
    if (list.hidden && e.key !== 'ArrowDown') return;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) run(); else highlight((activeIndex + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); highlight((activeIndex - 1 + items.length) % items.length); }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); pick(activeIndex); }
    else if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });
  const el = h('div', { class: 'field ac-field' },
    label ? h('label', { for: id }, label) : null,
    h('div', { class: 'ac-wrap' }, input, list),
    hint ? h('div', { class: 'field-hint' }, hint) : null);
  return { el, input, close, value: () => input.value.trim() };
}
