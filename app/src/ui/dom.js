// Small DOM helpers shared by all views, ported from WE Budget. User text
// only ever reaches the page through textContent: h() never sets innerHTML.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'value') el.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected') el[key] = !!value;
    else el.setAttribute(key, value === true ? '' : value);
  });
  append(el, children);
  return el;
}

export function append(el, children) {
  children.flat(Infinity).forEach(child => {
    if (child === null || child === undefined || child === false) return;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// A lucide icon placeholder; refreshIcons() turns it into an SVG.
export function icon(name, cls = '') {
  return h('i', { 'data-lucide': name, class: cls || null, 'aria-hidden': 'true' });
}

export function selectEl(options, value = null, attrs = {}) {
  const sel = h('select', attrs);
  options.forEach(o => sel.appendChild(h('option', { value: o.value, selected: o.value === value }, o.label)));
  if (value !== null && value !== undefined) sel.value = value;
  return sel;
}

export function emptyState({ title, text = null, iconName = 'inbox', action = null }) {
  return h('div', { class: 'empty-state' }, icon(iconName), h('h2', {}, title), text ? h('p', {}, text) : null, action);
}
