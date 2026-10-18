// A plain table for a report: a header, the rows (the first 500; the CSV
// export has all of them), a totals row and a CSV button. Report tables
// are short summaries, so they are drawn whole instead of virtualized.
//   column: { id, label, value(row) for CSV, render?(row) for the cell,
//             align?: 'num', total?(rows) }
import { h, icon } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { emptyState } from '../../components/empty-state.js';
import { downloadCsv } from './export.js';

export const MAX_ROWS = 500;

export function reportTable({ title, columns, rows, fileName, empty = null, onRowClick = null }) {
  const head = h('div', { class: 'report-table-head' },
    h('h3', {}, title),
    rows.length ? h('button', {
      type: 'button', class: 'btn btn-ghost btn-sm report-csv', onclick: () => downloadCsv(fileName, columns.map(c => ({ label: c.label, value: c.value })), rows)
    }, icon('download'), t('reports.export.csv')) : null);
  if (!rows.length) {
    return h('section', { class: 'report-block' }, head, emptyState({ title: empty || t('reports.empty'), iconName: 'chart-column' }));
  }
  const shown = rows.slice(0, MAX_ROWS);
  const cell = (c, row) => h('td', { class: c.align === 'num' ? 'num' : null }, c.render ? c.render(row) : String(c.value(row) ?? ''));
  const totals = columns.map(c => (c.total ? c.total(rows) : null));
  const table = h('table', { class: 'table report-table' },
    h('thead', {}, h('tr', {}, columns.map(c => h('th', { scope: 'col', class: c.align === 'num' ? 'num' : null }, c.label)))),
    h('tbody', {}, shown.map(row => h('tr', {
      class: onRowClick ? 'row is-link' : 'row', tabindex: onRowClick ? '0' : null,
      onclick: onRowClick ? () => onRowClick(row) : null,
      onkeydown: onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : null
    }, columns.map(c => cell(c, row))))),
    totals.some(v => v !== null) ? h('tfoot', {}, h('tr', {}, columns.map((c, i) => h('td', { class: c.align === 'num' ? 'num' : null }, totals[i] ?? (i === 0 ? t('table.total') : ''))))) : null);
  return h('section', { class: 'report-block' }, head,
    h('div', { class: 'table-scroll report-scroll' }, table),
    rows.length > MAX_ROWS ? h('p', { class: 'muted' }, t('reports.moreRows', { shown: MAX_ROWS, total: rows.length })) : null);
}
