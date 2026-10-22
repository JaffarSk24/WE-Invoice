// The list of a document screen: a table with virtual scrolling, columns
// the user can hide, two densities, totals at the bottom and selection
// for bulk actions. On a phone the same rows are cards. The list is only
// a view: it gets rows, shows them and reports clicks and selections.
//
//   createTable({ key, columns, rows, rowKey, selectable, bulkActions,
//                 onRowClick, empty })
//   column: { id, label, render(row), align: 'num'?, total(rows)?, primary?,
//             hidden? (off by default), always? (cannot be hidden),
//             sortValue(row)? }
import { h, icon, append } from '../ui/dom.js';
import { refreshIcons } from '../ui/icons.js';
import { t } from '../i18n/index.js';
import { getPrefs, setPref } from '../prefs.js';
import { setDensity } from '../ui/theme.js';
import { createVirtualList } from './virtual-list.js';
import { visibleColumnIds, loadColumnChoice, saveColumnChoice, openColumnPicker } from './table-columns.js';
import { renderCard, CARD_HEIGHT, cellContent } from './table-cards.js';

export const ROW_HEIGHT = Object.freeze({ comfortable: 48, compact: 36 });
export const DENSITIES = Object.freeze(['comfortable', 'compact']);

export function isPhone() {
  return typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches;
}

export function sortRows(rows, column, dir) {
  if (!column || !column.sortValue) return rows;
  const sign = dir === 'desc' ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const x = column.sortValue(a);
    const y = column.sortValue(b);
    if (typeof x === 'number' && typeof y === 'number') return sign * (x - y);
    return sign * String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true });
  });
}

export function createTable({ key, columns, rows = [], rowKey = (r) => r.id, selectable = false, bulkActions = [], onRowClick = null, empty = null }) {
  let all = rows;
  let visible = visibleColumnIds(columns, loadColumnChoice(key));
  let sort = { id: null, dir: 'asc' };
  const selected = new Set();
  const phone = isPhone();
  const density = () => (getPrefs().density === 'compact' ? 'compact' : 'comfortable');

  const el = h('div', { class: 'data-table', dataset: { key } });
  const toolbar = h('div', { class: 'table-toolbar' });
  const scroll = h('div', { class: 'table-scroll', tabindex: '0' });
  const emptyBox = h('div', { class: 'table-empty', hidden: true }, empty);
  const bulkBar = h('div', { class: 'bulk-bar', hidden: true, role: 'region', 'aria-label': t('table.bulk') });
  el.append(toolbar, bulkBar, scroll, emptyBox);

  const shown = () => columns.filter(c => visible.includes(c.id));
  const sorted = () => sortRows(all, columns.find(c => c.id === sort.id), sort.dir);
  const isSelected = (row) => selected.has(rowKey(row));
  const selectedRows = () => all.filter(isSelected);

  function toggle(row) {
    const k = rowKey(row);
    if (selected.has(k)) selected.delete(k); else selected.add(k);
    refreshBulk();
    list.refresh();
  }

  function refreshBulk() {
    while (bulkBar.firstChild) bulkBar.removeChild(bulkBar.firstChild);
    bulkBar.hidden = !selected.size;
    if (!selected.size) return;
    bulkBar.append(h('span', { class: 'bulk-count' }, t('table.selected', { n: selected.size })));
    // An action marked single (copy) applies to exactly one selected row.
    bulkActions.filter(a => !a.single || selected.size === 1).forEach(a => append(bulkBar, [h('button', {
      type: 'button', class: 'btn', onclick: () => a.onClick(selectedRows())
    }, a.icon ? icon(a.icon) : null, a.label)]));
    bulkBar.append(h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { selected.clear(); refreshBulk(); list.refresh(); } }, t('table.clearSelection')));
    refreshIcons(bulkBar);
  }

  function rowEl(row) {
    const cells = [];
    if (selectable) {
      cells.push(h('td', { class: 'col-select' }, h('input', {
        type: 'checkbox', checked: isSelected(row), 'aria-label': t('table.selectRow'), onclick: (e) => { e.stopPropagation(); toggle(row); }
      })));
    }
    shown().forEach(c => cells.push(h('td', { class: c.align === 'num' ? 'num' : null }, cellContent(c, row))));
    const tr = h('tr', {
      class: `row ${isSelected(row) ? 'is-selected' : ''}`.trim(), tabindex: onRowClick ? '0' : null, 'aria-selected': selectable ? String(isSelected(row)) : null,
      onclick: onRowClick ? () => onRowClick(row) : null,
      onkeydown: onRowClick ? (e) => { if (e.key === 'Enter') { e.preventDefault(); onRowClick(row); } } : null
    }, cells);
    return tr;
  }

  const spacerRow = (height) => h('tr', { class: 'vspacer', 'aria-hidden': 'true' }, h('td', { colspan: String(shown().length + (selectable ? 1 : 0)), style: { height: `${height}px`, padding: '0', border: '0' } }));
  const spacerDiv = (height) => h('div', { class: 'vspacer', 'aria-hidden': 'true', style: { height: `${height}px` } });

  let list = null;
  let tbody = null;

  function header() {
    const cells = [];
    if (selectable) {
      const allOn = all.length > 0 && all.every(isSelected);
      cells.push(h('th', { class: 'col-select', scope: 'col' }, h('input', {
        type: 'checkbox', checked: allOn, 'aria-label': t('table.selectAll'),
        onclick: () => { if (allOn) selected.clear(); else all.forEach(r => selected.add(rowKey(r))); refreshBulk(); build(); }
      })));
    }
    shown().forEach(c => {
      const sortable = Boolean(c.sortValue);
      const active = sort.id === c.id;
      const content = sortable
        ? h('button', {
          type: 'button', class: 'th-sort', onclick: () => { sort = { id: c.id, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' }; build(); }
        }, c.label, active ? icon(sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : null)
        : c.label;
      cells.push(h('th', { scope: 'col', class: c.align === 'num' ? 'num' : null, 'aria-sort': active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : null }, content));
    });
    return h('thead', {}, h('tr', {}, cells));
  }

  function footer() {
    const totals = shown().map(c => (c.total ? c.total(all) : null));
    if (!totals.some(v => v !== null && v !== undefined)) return null;
    return h('tfoot', {}, h('tr', {},
      selectable ? h('td', {}) : null,
      shown().map((c, i) => h('td', { class: c.align === 'num' ? 'num' : null }, i === 0 && (totals[0] === null || totals[0] === undefined) ? t('table.total') : (totals[i] ?? '')))));
  }

  function build() {
    if (list) list.destroy();
    while (scroll.firstChild) scroll.removeChild(scroll.firstChild);
    emptyBox.hidden = all.length > 0;
    scroll.hidden = all.length === 0;
    if (!all.length) return;
    if (phone) {
      const container = h('div', { class: 'card-list' });
      scroll.append(container);
      list = createVirtualList({
        rowHeight: CARD_HEIGHT, spacer: spacerDiv,
        renderRow: (row) => renderCard({
          row, columns: shown(), selectable, selected: isSelected(row), label: t('table.selectRow'),
          onToggle: () => toggle(row), onOpen: () => { if (onRowClick) onRowClick(row); }
        })
      });
    } else {
      tbody = h('tbody', {});
      const table = h('table', { class: `table density-${density()}` }, header(), tbody, footer());
      scroll.append(table);
      list = createVirtualList({ rowHeight: ROW_HEIGHT[density()], spacer: spacerRow, renderRow: rowEl });
    }
    list.mount(scroll, phone ? scroll.firstChild : tbody);
    list.setRows(sorted());
    refreshIcons(scroll);
  }

  function buildToolbar() {
    while (toolbar.firstChild) toolbar.removeChild(toolbar.firstChild);
    const count = h('span', { class: 'table-count', 'aria-live': 'polite' }, t('table.count', { n: all.length }));
    const densityGroup = h('div', { class: 'segmented', role: 'group', 'aria-label': t('table.density') },
      DENSITIES.map(d => h('button', {
        type: 'button', class: 'segment', 'aria-pressed': density() === d ? 'true' : 'false', dataset: { density: d },
        onclick: () => { setPref('density', d); setDensity(d); buildToolbar(); build(); }
      }, t(`table.density.${d}`))));
    const cols = h('button', {
      type: 'button', class: 'btn btn-ghost', onclick: () => openColumnPicker({
        columns, visible, onApply: (ids) => { visible = visibleColumnIds(columns, saveColumnChoice(key, ids)); build(); }
      })
    }, icon('columns-3'), t('table.columns'));
    append(toolbar, [count, h('div', { class: 'table-tools' }, phone ? null : densityGroup, cols)]);
    refreshIcons(toolbar);
  }

  buildToolbar();
  build();
  return {
    el,
    setRows(next) { all = next || []; selected.clear(); refreshBulk(); buildToolbar(); build(); },
    selected: selectedRows,
    refresh: build,
    visibleColumns: () => visible.slice()
  };
}
