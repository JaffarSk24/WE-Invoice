// The dialog for a move typed in by hand: príjemka (receipt), výdajka
// (issue) or prevodka (transfer). It checks the move with the core before
// saving and asks before a move that would take a balance below zero. An
// item that is not in the price list yet can be added from here as a
// stock-tracked item, with its code and barcode for the stocktaking.
import { negativeStockWarnings, normalizeStockMove, vatRatesOn } from '@we-invoice/core';
import { h } from '../../ui/dom.js';
import { t } from '../../i18n/index.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { todayLocal } from '../../components/dates.js';
import { textField, numberField, dateField, selectField } from '../../components/fields.js';
import { stockData, addMoves, ensureWarehouse, createStockItem } from './data.js';
import { qtyText, nameIndex, refuseWrite } from './format.js';

const FIELD_OF = { qty: 'qty', unitCost: 'cost', date: 'date', itemId: 'item', warehouseId: 'warehouse', targetWarehouseId: 'target' };

function itemOptions(items) {
  const tracked = items.filter(i => i.stockTracked).sort((a, b) => a.name.localeCompare(b.name));
  return [{ value: '', label: t('stock.move.pickItem') }, ...tracked.map(i => ({ value: i.id, label: i.code ? `${i.name} (${i.code})` : i.name }))];
}

function openNewItem(onCreated) {
  const name = textField({ label: t('stock.item.name'), required: true, attrs: { id: 'stock-new-item-name' } });
  const code = textField({ label: t('stock.item.code'), attrs: { id: 'stock-new-item-code', maxlength: '40' } });
  const barcode = textField({ label: t('stock.item.barcode'), attrs: { id: 'stock-new-item-barcode', inputmode: 'numeric', maxlength: '40' } });
  const unit = textField({ label: t('stock.item.unit'), value: t('stock.item.unitDefault') });
  const price = numberField({ label: t('stock.item.price') });
  openModal({
    title: t('stock.item.new'),
    body: h('div', { class: 'form-grid' }, name.el, code.el, barcode.el, unit.el, price.el),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('common.save'), kind: 'primary', onClick: async (m) => {
          if (!name.value()) { name.setError(t('stock.item.nameRequired')); return; }
          try {
            const standard = vatRatesOn(todayLocal()).find(r => r.code === 'STANDARD');
            const item = await createStockItem({ name: name.value(), code: code.value(), barcode: barcode.value(), unitLabel: unit.value(), price: price.value() || '0', vatRate: standard ? standard.rate : null });
            m.close();
            onCreated(item);
          } catch (e) { showError(e, 'stock.error.save'); }
        }
      }
    ]
  });
}

/**
 * @param {'RECEIPT'|'ISSUE'|'TRANSFER'} kind
 * @param {{itemId?: string, warehouseId?: string}} [preset]
 */
export async function openMoveDialog(kind, preset = {}) {
  if (refuseWrite()) return;
  try { await ensureWarehouse(); } catch (e) { showError(e, 'stock.error.save'); return; }
  const data = stockData();
  const warehouseOptions = data.warehouses.map(w => ({ value: w.id, label: w.name }));
  const firstWarehouse = preset.warehouseId || data.warehouses[0]?.id || '';

  const item = selectField({ label: t('stock.move.item'), options: itemOptions(data.items), value: preset.itemId || '', required: true, attrs: { id: 'stock-move-item' } });
  const addItem = h('button', {
    type: 'button', class: 'btn btn-ghost btn-sm', id: 'stock-move-new-item',
    onclick: () => openNewItem((created) => {
      item.input.append(h('option', { value: created.id }, created.code ? `${created.name} (${created.code})` : created.name));
      item.input.value = created.id;
    })
  }, t('stock.item.new'));
  const date = dateField({ label: t('stock.move.date'), value: todayLocal(), required: true });
  const qty = numberField({ label: t('stock.move.qty'), required: true, attrs: { id: 'stock-move-qty' } });
  const warehouse = selectField({ label: kind === 'TRANSFER' ? t('stock.move.from') : t('stock.move.warehouse'), options: warehouseOptions, value: firstWarehouse });
  const target = kind === 'TRANSFER'
    ? selectField({ label: t('stock.move.to'), options: warehouseOptions, value: data.warehouses.find(w => w.id !== firstWarehouse)?.id || firstWarehouse })
    : null;
  const cost = kind === 'RECEIPT' ? numberField({ label: t('stock.move.unitCost'), hint: t('stock.move.unitCostHint'), attrs: { id: 'stock-move-cost' } }) : null;
  const note = textField({ label: t('stock.move.note') });
  const fields = { item, date, qty, warehouse, target, cost, note };

  const body = h('div', { class: 'stock-move-form' },
    h('div', { class: 'stock-item-row' }, item.el, addItem),
    h('div', { class: 'form-grid' }, date.el, qty.el, warehouse.el, target ? target.el : null, cost ? cost.el : null),
    note.el);

  async function save(modal) {
    Object.values(fields).forEach(f => f && f.setError(''));
    let move;
    try {
      move = normalizeStockMove({
        kind, date: date.value(), itemId: item.value(), qty: qty.value(), warehouseId: warehouse.value(),
        targetWarehouseId: target ? target.value() : null, unitCost: cost ? cost.value() : null, note: note.value() || null
      });
    } catch (e) {
      const field = fields[FIELD_OF[e.details?.field]];
      if (field) { field.setError(t(`stock.move.invalid.${e.details.field}`)); return; }
      showError(e, 'stock.error.save');
      return;
    }
    if (kind !== 'RECEIPT') {
      const warnings = negativeStockWarnings(stockData().moves, [move]);
      if (warnings.length) {
        const name = nameIndex(data.items)(move.itemId);
        const ok = await confirmDialog(t('stock.warning.negativeConfirm', { item: name, qty: qtyText(warnings[0].qty) }), { okLabel: t('stock.warning.saveAnyway') });
        if (!ok) return;
      }
    }
    try {
      await addMoves([move]);
      modal.close();
      showToast(t(`stock.move.saved.${kind}`), { type: 'success' });
    } catch (e) { showError(e, 'stock.error.save'); }
  }

  openModal({
    title: t(`stock.move.title.${kind}`),
    body,
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      { label: t('common.save'), kind: 'primary', onClick: (m) => save(m) }
    ]
  });
}
