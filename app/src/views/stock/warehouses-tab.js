// "Sklady" tab: the company's warehouses (add, rename, mark the default
// one, remove an empty one) and the valuation method of the stock
// (weighted average cost or FIFO).
import { stockLevels, levelsByItem, VALUATION_METHODS } from '@we-invoice/core';
import { h, icon, append } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { textField, checkboxField } from '../../components/fields.js';
import { emptyState } from '../../components/empty-state.js';
import { saveWarehouse, removeWarehouse, valuationMethod, setValuationMethod } from './data.js';
import { qtyText, refuseWrite } from './format.js';

function openWarehouseForm(warehouse = null) {
  if (refuseWrite()) return;
  const name = textField({ label: t('stock.warehouse.name'), value: warehouse?.name || '', required: true, attrs: { id: 'stock-warehouse-name' } });
  const code = textField({ label: t('stock.warehouse.code'), value: warehouse?.code || '', attrs: { maxlength: '20' } });
  const isDefault = checkboxField({ label: t('stock.warehouse.isDefault'), checked: Boolean(warehouse?.isDefault) });
  openModal({
    title: warehouse ? t('stock.warehouse.edit') : t('stock.warehouse.new'),
    body: h('div', { class: 'form-grid' }, name.el, code.el, isDefault.el),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('common.save'), kind: 'primary', onClick: async (m) => {
          if (!name.value()) { name.setError(t('errors.STOCK_WAREHOUSE_NAME')); return; }
          try {
            await saveWarehouse({ name: name.value(), code: code.value(), isDefault: isDefault.value() }, warehouse?.id || null);
            m.close();
            showToast(t('stock.warehouse.saved'), { type: 'success' });
          } catch (e) { showError(e, 'stock.error.save'); }
        }
      }
    ]
  });
}

async function askRemove(warehouse) {
  if (refuseWrite()) return;
  const ok = await confirmDialog(t('stock.warehouse.removeConfirm', { name: warehouse.name }), { danger: true, okLabel: t('stock.warehouse.remove') });
  if (!ok) return;
  try { await removeWarehouse(warehouse.id); showToast(t('stock.warehouse.removed'), { type: 'success' }); } catch (e) { showError(e, 'stock.error.save'); }
}

export function renderWarehousesTab(panel, data) {
  const list = h('div', { class: 'stock-warehouses' });
  const method = h('select', {
    id: 'stock-valuation', 'aria-describedby': 'stock-valuation-hint',
    onchange: async (e) => {
      if (refuseWrite()) { e.target.value = valuationMethod(data.company); return; }
      try { await setValuationMethod(e.target.value); showToast(t('stock.valuation.saved'), { type: 'success' }); } catch (err) { showError(err, 'stock.error.save'); }
    }
  }, VALUATION_METHODS.map(m => h('option', { value: m }, t(`stock.valuation.${m}`))));

  function draw() {
    method.value = valuationMethod(data.company);
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!data.warehouses.length) {
      list.append(emptyState({ title: t('stock.warehouse.empty.title'), text: t('stock.warehouse.empty.text'), iconName: 'boxes', actionLabel: t('stock.warehouse.new'), onAction: () => openWarehouseForm() }));
      return;
    }
    for (const w of data.warehouses) {
      const levels = stockLevels(data.moves, { warehouseId: w.id });
      const items = levelsByItem(levels).size;
      append(list, [h('article', { class: 'card stock-warehouse', dataset: { warehouse: w.id } },
        h('div', { class: 'stock-warehouse-text' },
          h('h3', {}, w.name, w.isDefault ? h('span', { class: 'badge' }, t('stock.warehouse.default')) : null),
          h('p', { class: 'muted' }, [w.code, t('stock.warehouse.itemCount', { n: qtyText(String(items)) })].filter(Boolean).join(' · '))),
        h('div', { class: 'stock-warehouse-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openWarehouseForm(w) }, icon('pencil-line'), t('stock.warehouse.edit')),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', disabled: items > 0, title: items > 0 ? t('errors.STOCK_WAREHOUSE_NOT_EMPTY') : null, onclick: () => askRemove(w) }, icon('x'), t('stock.warehouse.remove'))))]);
    }
    refreshIcons(list);
  }

  panel.append(
    h('div', { class: 'stock-filters' }, h('button', { type: 'button', class: 'btn btn-primary', id: 'stock-warehouse-add', onclick: () => openWarehouseForm() }, icon('plus'), t('stock.warehouse.new'))),
    list,
    h('section', { class: 'card stock-valuation' },
      h('label', { for: 'stock-valuation', class: 'setting-label' }, t('stock.valuation.label')),
      method,
      h('p', { class: 'field-hint', id: 'stock-valuation-hint' }, t('stock.valuation.hint'))));
  refreshIcons(panel);
  draw();
  return { refresh(next) { data = next; draw(); } };
}
