// "Zásoby" tab: what is on hand per item, in one warehouse or in all, on a
// chosen day, with what open orders hold, what is free to sell, the unit
// cost and value by the company's valuation method, and the items under
// their minimum. The table exports to CSV.
import { stockLevels, levelsByItem, stockReservations, availableStock, stockValuation, cmp } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { todayLocal } from '../../components/dates.js';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { valuationMethod } from './data.js';
import { qtyText, moneyText, unitLabel, downloadCsv } from './format.js';
import { openMoveDialog } from './move-dialog.js';

/** Rows of the levels table: pure, for tests and the CSV export. */
export function levelRows(data, { warehouseId = '', date = null, query = '', lowOnly = false } = {}) {
  const levels = stockLevels(data.moves, { date, warehouseId: warehouseId || null, keepZero: true });
  const onHand = levelsByItem(levels);
  // The minimum is for the whole company, whatever warehouse is shown.
  const total = warehouseId ? levelsByItem(stockLevels(data.moves, { date })) : onHand;
  const reserved = warehouseId ? new Map() : stockReservations(data.documents, { items: data.items });
  const value = new Map(stockValuation(data.moves, { method: valuationMethod(data.company), date }).map(v => [v.itemId, v]));
  const q = query.trim().toLowerCase();
  return data.items
    .filter(item => item.stockTracked || onHand.has(item.id))
    .filter(item => !q || item.name.toLowerCase().includes(q) || String(item.code || '').toLowerCase().includes(q) || String(item.barcode || '') === q)
    .map(item => {
      const qty = onHand.get(item.id) || '0';
      const held = reserved.get(item.id) || '0';
      const v = value.get(item.id);
      const low = item.minStock !== null && item.minStock !== undefined && item.minStock !== '' && cmp(total.get(item.id) || '0', item.minStock) < 0;
      return {
        id: item.id, name: item.name, code: item.code || '', unit: unitLabel(item), qty, reserved: held, available: availableStock(qty, held),
        unitCost: v ? v.unitCost : '0', value: v && !warehouseId ? v.value : null, minStock: item.minStock || null, low, negative: cmp(qty, '0') < 0
      };
    })
    .filter(row => !lowOnly || row.low)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function qtyCell(row) {
  return h('span', { class: row.negative ? 'stock-negative' : null }, qtyText(row.qty));
}

export function renderLevelsTab(panel, data) {
  const state = { warehouseId: '', date: todayLocal(), query: '', lowOnly: false };
  const columns = [
    { id: 'name', label: t('stock.col.item'), primary: true, always: true, render: (r) => h('span', {}, r.name, r.low ? h('span', { class: 'badge stock-low-badge' }, t('stock.levels.low')) : null), sortValue: (r) => r.name },
    { id: 'code', label: t('stock.col.code'), render: (r) => r.code, sortValue: (r) => r.code },
    { id: 'qty', label: t('stock.col.qty'), align: 'num', render: qtyCell, sortValue: (r) => Number(r.qty) },
    { id: 'unit', label: t('stock.col.unit'), render: (r) => r.unit },
    { id: 'reserved', label: t('stock.col.reserved'), align: 'num', render: (r) => qtyText(r.reserved), sortValue: (r) => Number(r.reserved) },
    { id: 'available', label: t('stock.col.available'), align: 'num', render: (r) => qtyText(r.available), sortValue: (r) => Number(r.available) },
    { id: 'minStock', label: t('stock.col.minStock'), align: 'num', hidden: true, render: (r) => (r.minStock ? qtyText(r.minStock) : '') },
    { id: 'unitCost', label: t('stock.col.unitCost'), align: 'num', render: (r) => moneyText(r.unitCost), sortValue: (r) => Number(r.unitCost) },
    { id: 'value', label: t('stock.col.value'), align: 'num', render: (r) => (r.value === null ? '' : moneyText(r.value)), sortValue: (r) => Number(r.value || 0) }
  ];
  const table = createTable({
    key: 'stock-levels', columns, rows: [],
    onRowClick: (row) => openMoveDialog('RECEIPT', { itemId: row.id, warehouseId: state.warehouseId || undefined }),
    empty: emptyState({ title: t('stock.levels.empty.title'), text: t('stock.levels.empty.text'), iconName: 'boxes', actionLabel: t('stock.action.receipt'), onAction: () => openMoveDialog('RECEIPT') })
  });

  const warehouse = h('select', { 'aria-label': t('stock.filter.warehouse'), onchange: (e) => { state.warehouseId = e.target.value; draw(); } },
    h('option', { value: '' }, t('stock.filter.allWarehouses')),
    data.warehouses.map(w => h('option', { value: w.id }, w.name)));
  const date = h('input', { type: 'date', value: state.date, 'aria-label': t('stock.filter.date'), onchange: (e) => { state.date = e.target.value || todayLocal(); draw(); } });
  const search = h('input', { type: 'search', placeholder: t('stock.filter.search'), 'aria-label': t('stock.filter.search'), oninput: (e) => { state.query = e.target.value; draw(); } });
  const low = h('label', { class: 'checkbox-label' }, h('input', { type: 'checkbox', onchange: (e) => { state.lowOnly = e.target.checked; draw(); } }), h('span', {}, t('stock.filter.lowOnly')));
  const exportBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => exportCsv() }, icon('download'), t('stock.action.exportCsv'));
  let rows = [];

  function draw() {
    rows = levelRows(data, state);
    table.setRows(rows);
  }

  function exportCsv() {
    const cols = ['name', 'code', 'qty', 'unit', 'reserved', 'available', 'unitCost', 'value'].map(id => ({ id, label: columns.find(c => c.id === id).label }));
    return downloadCsv(t('stock.csv.levelsFile', { date: state.date }), cols, rows.map(r => ({ ...r, value: r.value ?? '' })));
  }

  panel.append(h('div', { class: 'stock-filters' }, search, warehouse, date, low, exportBtn), table.el);
  refreshIcons(panel);
  draw();
  return { refresh(next) { data = next; draw(); } };
}
