// "Inventúra" tab: the user counts the goods of one warehouse on a day,
// sees the difference against the books for every counted item and posts
// the differences as inventory adjustments in one step. Items left blank
// are not counted and keep their balance.
import { inventoryDifferences, stockLevels, sub, isNegative } from '@we-invoice/core';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { todayLocal, formatDate } from '../../components/dates.js';
import { parseDecimal } from '../../components/decimal.js';
import { confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { emptyState } from '../../components/empty-state.js';
import { addMoves, ensureWarehouse } from './data.js';
import { qtyText, unitLabel, refuseWrite } from './format.js';

export function renderInventoryTab(panel, data) {
  const state = { warehouseId: data.warehouses[0]?.id || '', date: todayLocal(), counts: {} };
  const body = h('div', { class: 'stock-inventory' });

  function book() {
    return new Map(stockLevels(data.moves, { warehouseId: state.warehouseId, date: state.date, keepZero: true }).map(r => [r.itemId, r.qty]));
  }

  function rowsToCount() {
    const levels = book();
    return data.items.filter(i => i.stockTracked || levels.has(i.id)).sort((a, b) => a.name.localeCompare(b.name)).map(i => ({ item: i, book: levels.get(i.id) || '0' }));
  }

  function differences() {
    const counts = {};
    for (const [itemId, text] of Object.entries(state.counts)) {
      if (String(text).trim() === '') continue;
      counts[itemId] = parseDecimal(text) ?? String(text);
    }
    return inventoryDifferences(data.moves, { warehouseId: state.warehouseId, date: state.date, counts, note: t('stock.inventory.note', { date: formatDate(state.date) }) });
  }

  async function post() {
    if (refuseWrite()) return;
    let rows;
    try { rows = differences(); } catch (e) { showError(e, 'stock.error.save'); return; }
    const moves = rows.map(r => r.move).filter(Boolean);
    if (!moves.length) { showToast(t('stock.inventory.nothing'), { type: 'info' }); return; }
    const ok = await confirmDialog(t('stock.inventory.confirm', { n: moves.length, date: formatDate(state.date) }), { okLabel: t('stock.inventory.post') });
    if (!ok) return;
    try {
      await addMoves(moves);
      state.counts = {};
      showToast(t('stock.inventory.posted', { n: moves.length }), { type: 'success' });
    } catch (e) { showError(e, 'stock.error.save'); }
  }

  function draw() {
    while (body.firstChild) body.removeChild(body.firstChild);
    if (!data.warehouses.length) {
      body.append(emptyState({
        title: t('stock.inventory.noWarehouse'), iconName: 'clipboard-list', actionLabel: t('stock.warehouse.createDefault'),
        onAction: async () => { if (refuseWrite()) return; try { await ensureWarehouse(); } catch (e) { showError(e, 'stock.error.save'); } }
      }));
      return;
    }
    const list = rowsToCount();
    if (!list.length) { body.append(emptyState({ title: t('stock.inventory.noItems'), iconName: 'clipboard-list' })); return; }
    const table = h('table', { class: 'table stock-count-table' },
      h('thead', {}, h('tr', {},
        h('th', { scope: 'col' }, t('stock.col.item')), h('th', { scope: 'col', class: 'num' }, t('stock.inventory.book')),
        h('th', { scope: 'col', class: 'num' }, t('stock.inventory.counted')), h('th', { scope: 'col', class: 'num' }, t('stock.inventory.difference')))),
      h('tbody', {}, list.map(({ item, book: qty }) => {
        const diff = h('td', { class: 'num stock-diff' });
        const update = () => {
          const parsed = parseDecimal(state.counts[item.id] ?? '');
          const difference = parsed === null ? null : sub(parsed, qty);
          diff.textContent = difference === null ? '' : qtyText(difference);
          diff.classList.toggle('stock-negative', difference !== null && isNegative(difference));
        };
        const input = h('input', {
          type: 'text', inputmode: 'decimal', class: 'num stock-count-input', value: state.counts[item.id] ?? '', dataset: { item: item.id },
          'aria-label': t('stock.inventory.countFor', { item: item.name }), oninput: (e) => { state.counts[item.id] = e.target.value; update(); }
        });
        const row = h('tr', {}, h('td', {}, item.name, h('span', { class: 'muted' }, ` ${unitLabel(item)}`)), h('td', { class: 'num' }, qtyText(qty)), h('td', { class: 'num' }, input), diff);
        update();
        return row;
      })));
    body.append(h('div', { class: 'table-scroll stock-count-scroll' }, table),
      h('div', { class: 'stock-actions' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'stock-inventory-post', onclick: post }, t('stock.inventory.post'))));
  }

  const warehouse = h('select', { 'aria-label': t('stock.filter.warehouse'), onchange: (e) => { state.warehouseId = e.target.value; state.counts = {}; draw(); } },
    data.warehouses.map(w => h('option', { value: w.id }, w.name)));
  const date = h('input', { type: 'date', value: state.date, 'aria-label': t('stock.filter.date'), onchange: (e) => { state.date = e.target.value || todayLocal(); draw(); } });
  panel.append(h('p', { class: 'muted' }, t('stock.inventory.intro')), h('div', { class: 'stock-filters' }, warehouse, date), body);
  draw();
  return {
    refresh(next) {
      data = next;
      if (!data.warehouses.some(w => w.id === state.warehouseId)) state.warehouseId = data.warehouses[0]?.id || '';
      warehouse.replaceChildren(...data.warehouses.map(w => h('option', { value: w.id, selected: w.id === state.warehouseId }, w.name)));
      draw();
    }
  };
}
