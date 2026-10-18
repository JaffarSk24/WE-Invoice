// The phone form of a list: one card per row instead of a table row. The
// first column is the title, the column marked `primary` (an amount, a
// status) sits on the right, the rest are small lines below. Cards use the
// same virtual list as the table.
import { h } from '../ui/dom.js';

export const CARD_HEIGHT = 92;

export function cellContent(column, row) {
  const value = column.render ? column.render(row) : row[column.id];
  if (value === null || value === undefined) return '';
  return value;
}

export function renderCard({ row, columns, selectable, selected, onToggle, onOpen, label }) {
  const [title, ...rest] = columns;
  const primary = rest.find(c => c.primary) || null;
  const lines = rest.filter(c => c !== primary && !c.cardHidden).slice(0, 2);
  const check = selectable
    ? h('input', { type: 'checkbox', class: 'card-check', checked: selected, 'aria-label': label, onclick: (e) => { e.stopPropagation(); onToggle(); } })
    : null;
  return h('div', {
    class: `list-card ${selected ? 'is-selected' : ''}`.trim(), role: 'button', tabindex: '0', style: { height: `${CARD_HEIGHT}px` },
    onclick: onOpen, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }
  },
  check,
  h('div', { class: 'list-card-body' },
    h('div', { class: 'list-card-top' },
      h('span', { class: 'list-card-title' }, cellContent(title, row)),
      primary ? h('span', { class: 'list-card-primary num' }, cellContent(primary, row)) : null),
    lines.map(c => h('div', { class: 'list-card-line' }, h('span', { class: 'muted' }, c.label), ' ', h('span', {}, cellContent(c, row))))));
}
