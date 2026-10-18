// "Pohyby" tab: the movement report for a period (03-features.md § 3.4),
// filtered by kind and warehouse, with the cost of every move by the
// company's valuation method and the item balance after it. A move typed
// in by hand can be deleted here; moves of documents follow their document.
import { costStockMoves } from '@we-invoice/core';
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { todayLocal, periodRange, formatDate } from '../../components/dates.js';
import { createTable } from '../../components/table.js';
import { emptyState } from '../../components/empty-state.js';
import { confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { valuationMethod, removeMove } from './data.js';
import { qtyText, moneyText, nameIndex, downloadCsv, refuseWrite } from './format.js';

const KINDS = ['RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT'];

/** Rows of the movement report: pure, for tests and the CSV export. */
export function moveRows(data, { from = null, to = null, kind = '', warehouseId = '' } = {}) {
  const itemName = nameIndex(data.items);
  const warehouseName = nameIndex(data.warehouses);
  const docs = new Map(data.documents.map(d => [d.id, d]));
  // Costs need the whole history up to the end of the period.
  return costStockMoves(data.moves, { method: valuationMethod(data.company), date: to })
    .filter(m => (!from || m.date >= from) && (!kind || m.kind === kind)
      && (!warehouseId || m.warehouseId === warehouseId || m.targetWarehouseId === warehouseId))
    .map(m => {
      const out = m.kind === 'ISSUE' || (m.kind === 'ADJUSTMENT' && m.qty.startsWith('-'));
      const doc = m.docId ? docs.get(m.docId) : null;
      return {
        id: m.id, date: m.date, kind: m.kind, kindLabel: t(`stock.kind.${m.kind}`), item: itemName(m.itemId),
        warehouse: m.targetWarehouseId ? `${warehouseName(m.warehouseId)} → ${warehouseName(m.targetWarehouseId)}` : warehouseName(m.warehouseId),
        qty: out && !m.qty.startsWith('-') ? `-${m.qty}` : m.qty, unitCost: m.unitCost, value: m.value, balance: m.balanceQty,
        source: doc ? (doc.number || t(`document.kind.${doc.kind}`)) : (m.note || ''), manual: !m.docId
      };
    })
    .reverse();
}

export function renderMovesTab(panel, data) {
  const year = periodRange('thisYear', todayLocal());
  const state = { from: year.from, to: todayLocal(), kind: '', warehouseId: '' };
  const columns = [
    { id: 'date', label: t('stock.col.date'), render: (r) => formatDate(r.date), sortValue: (r) => r.date },
    { id: 'kind', label: t('stock.col.kind'), render: (r) => h('span', { class: `stock-kind stock-kind-${r.kind.toLowerCase()}` }, r.kindLabel), sortValue: (r) => r.kindLabel },
    { id: 'item', label: t('stock.col.item'), primary: true, always: true, render: (r) => r.item, sortValue: (r) => r.item },
    { id: 'warehouse', label: t('stock.col.warehouse'), render: (r) => r.warehouse },
    { id: 'qty', label: t('stock.col.qty'), align: 'num', render: (r) => qtyText(r.qty), sortValue: (r) => Number(r.qty) },
    { id: 'unitCost', label: t('stock.col.unitCost'), align: 'num', render: (r) => moneyText(r.unitCost) },
    { id: 'value', label: t('stock.col.value'), align: 'num', render: (r) => moneyText(r.value), sortValue: (r) => Number(r.value) },
    { id: 'balance', label: t('stock.col.balance'), align: 'num', hidden: true, render: (r) => qtyText(r.balance) },
    { id: 'source', label: t('stock.col.source'), render: (r) => r.source }
  ];
  const table = createTable({
    key: 'stock-moves', columns, rows: [], onRowClick: (row) => askDelete(row),
    empty: emptyState({ title: t('stock.moves.empty.title'), text: t('stock.moves.empty.text'), iconName: 'truck' })
  });
  let rows = [];

  async function askDelete(row) {
    if (!row.manual) { showToast(t('errors.STOCK_MOVE_FROM_DOCUMENT'), { type: 'info' }); return; }
    if (refuseWrite()) return;
    const ok = await confirmDialog(t('stock.moves.deleteConfirm', { item: row.item, date: formatDate(row.date) }), { danger: true, okLabel: t('stock.moves.delete') });
    if (!ok) return;
    try { await removeMove(row.id); showToast(t('stock.moves.deleted'), { type: 'success' }); } catch (e) { showError(e, 'stock.error.save'); }
  }

  const dateInput = (key, label) => h('input', { type: 'date', value: state[key], 'aria-label': label, onchange: (e) => { state[key] = e.target.value || null; draw(); } });
  const kind = h('select', { 'aria-label': t('stock.filter.kind'), onchange: (e) => { state.kind = e.target.value; draw(); } },
    h('option', { value: '' }, t('stock.filter.allKinds')), KINDS.map(k => h('option', { value: k }, t(`stock.kind.${k}`))));
  const warehouse = h('select', { 'aria-label': t('stock.filter.warehouse'), onchange: (e) => { state.warehouseId = e.target.value; draw(); } },
    h('option', { value: '' }, t('stock.filter.allWarehouses')), data.warehouses.map(w => h('option', { value: w.id }, w.name)));
  const exportBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => exportCsv() }, icon('download'), t('stock.action.exportCsv'));

  function draw() {
    rows = moveRows(data, state);
    table.setRows(rows);
  }

  function exportCsv() {
    const cols = ['date', 'kindLabel', 'item', 'warehouse', 'qty', 'unitCost', 'value', 'balance', 'source']
      .map(id => ({ id, label: t(`stock.col.${id === 'kindLabel' ? 'kind' : id}`) }));
    return downloadCsv(t('stock.csv.movesFile', { from: state.from || '', to: state.to || '' }), cols, rows);
  }

  panel.append(h('div', { class: 'stock-filters' },
    dateInput('from', t('stock.filter.from')), dateInput('to', t('stock.filter.to')), kind, warehouse, exportBtn), table.el);
  refreshIcons(panel);
  draw();
  return { refresh(next) { data = next; draw(); } };
}
