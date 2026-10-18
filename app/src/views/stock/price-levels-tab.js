// "Cenové hladiny" tab: price levels such as "Veľkoobchod" with a discount
// off the list price, optional validity and quantity discounts, and the
// prices of items on a level. Which level a client has is set on the
// client card (WP-CRM); the editor asks priceFor() for line prices.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { openModal, confirmDialog } from '../../ui/modal.js';
import { showToast, showError } from '../../ui/toast.js';
import { textField, numberField, dateField } from '../../components/fields.js';
import { parseDecimal, toInputText } from '../../components/decimal.js';
import { emptyState } from '../../components/empty-state.js';
import { formatDate } from '../../components/dates.js';
import { savePriceLevel, removePriceLevel, saveLevelPrices } from './data.js';
import { moneyText, qtyText, refuseWrite } from './format.js';

function breakRow(value = {}) {
  const minQty = h('input', { type: 'text', inputmode: 'decimal', class: 'num', value: toInputText(value.minQty ?? null), 'aria-label': t('stock.priceLevel.minQty') });
  const pct = h('input', { type: 'text', inputmode: 'decimal', class: 'num', value: toInputText(value.discountPct ?? null), 'aria-label': t('stock.priceLevel.breakPct') });
  const row = h('div', { class: 'stock-break-row' }, h('span', {}, t('stock.priceLevel.from')), minQty, h('span', {}, t('stock.priceLevel.pieces')), pct, h('span', {}, '%'),
    h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': t('stock.priceLevel.removeBreak'), onclick: () => row.remove() }, icon('x')));
  row.read = () => ({ minQty: parseDecimal(minQty.value), discountPct: parseDecimal(pct.value) });
  return row;
}

function openLevelForm(level = null) {
  if (refuseWrite()) return;
  const name = textField({ label: t('stock.priceLevel.name'), value: level?.name || '', required: true, attrs: { id: 'stock-level-name' } });
  const discount = numberField({ label: t('stock.priceLevel.discount'), value: level?.discountPct ?? null, hint: t('stock.priceLevel.discountHint') });
  const from = dateField({ label: t('stock.priceLevel.validFrom'), value: level?.validFrom || '' });
  const to = dateField({ label: t('stock.priceLevel.validTo'), value: level?.validTo || '' });
  const breaks = h('div', { class: 'stock-breaks' }, (level?.qtyBreaks || []).map(breakRow));
  const add = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { breaks.append(breakRow()); refreshIcons(breaks); } }, icon('plus'), t('stock.priceLevel.addBreak'));
  openModal({
    title: level ? t('stock.priceLevel.edit') : t('stock.priceLevel.new'),
    body: h('div', {}, h('div', { class: 'form-grid' }, name.el, discount.el, from.el, to.el),
      h('h4', { class: 'stock-subtitle' }, t('stock.priceLevel.breaks')), breaks, add),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('common.save'), kind: 'primary', onClick: async (m) => {
          if (!name.value()) { name.setError(t('errors.STOCK_PRICE_LEVEL_NAME')); return; }
          if (from.value() && to.value() && from.value() > to.value()) { to.setError(t('stock.priceLevel.badRange')); return; }
          const qtyBreaks = [...breaks.children].map(r => r.read()).filter(b => b.minQty && b.discountPct);
          try {
            await savePriceLevel({ name: name.value(), discountPct: discount.value(), validFrom: from.value(), validTo: to.value(), qtyBreaks }, level?.id || null);
            m.close();
            showToast(t('stock.priceLevel.saved'), { type: 'success' });
          } catch (e) { showError(e, 'stock.error.save'); }
        }
      }
    ]
  });
}

function openLevelPrices(level, items) {
  if (refuseWrite()) return;
  const inputs = new Map();
  const rows = items.slice().sort((a, b) => a.name.localeCompare(b.name)).map(item => {
    const input = h('input', { type: 'text', inputmode: 'decimal', class: 'num', value: toInputText(item.prices?.[level.id] ?? null), 'aria-label': t('stock.priceLevel.priceFor', { item: item.name }) });
    inputs.set(item.id, input);
    return h('tr', {}, h('td', {}, item.name), h('td', { class: 'num' }, moneyText(item.price, item.currency || 'EUR')), h('td', { class: 'num' }, input));
  });
  openModal({
    title: t('stock.priceLevel.pricesTitle', { name: level.name }),
    wide: true,
    body: items.length
      ? h('div', { class: 'table-scroll stock-count-scroll' }, h('table', { class: 'table' },
        h('thead', {}, h('tr', {}, h('th', {}, t('stock.col.item')), h('th', { class: 'num' }, t('stock.priceLevel.listPrice')), h('th', { class: 'num' }, t('stock.priceLevel.levelPrice')))),
        h('tbody', {}, rows)))
      : h('p', { class: 'muted' }, t('stock.priceLevel.noItems')),
    actions: [
      { label: t('common.cancel'), onClick: (m) => m.close() },
      {
        label: t('common.save'), kind: 'primary', onClick: async (m) => {
          const prices = {};
          for (const [id, input] of inputs) {
            const text = input.value.trim();
            const price = text === '' ? null : parseDecimal(text);
            input.setAttribute('aria-invalid', text !== '' && price === null ? 'true' : 'false');
            if (text !== '' && (price === null || price.startsWith('-'))) { showToast(t('stock.priceLevel.badPrice'), { type: 'error' }); input.focus(); return; }
            prices[id] = price;
          }
          try { await saveLevelPrices(level.id, prices); m.close(); showToast(t('stock.priceLevel.saved'), { type: 'success' }); } catch (e) { showError(e, 'stock.error.save'); }
        }
      }
    ]
  });
}

async function askRemove(level) {
  if (refuseWrite()) return;
  if (!(await confirmDialog(t('stock.priceLevel.removeConfirm', { name: level.name }), { danger: true, okLabel: t('stock.priceLevel.remove') }))) return;
  try { await removePriceLevel(level.id); showToast(t('stock.priceLevel.removed'), { type: 'success' }); } catch (e) { showError(e, 'stock.error.save'); }
}

function describe(level, contacts) {
  const parts = [];
  if (level.discountPct) parts.push(t('stock.priceLevel.discountShort', { pct: qtyText(level.discountPct) }));
  if (level.validFrom || level.validTo) parts.push(t('stock.priceLevel.validity', { from: level.validFrom ? formatDate(level.validFrom) : '', to: level.validTo ? formatDate(level.validTo) : '' }));
  if ((level.qtyBreaks || []).length) parts.push(t('stock.priceLevel.breakCount', { n: String(level.qtyBreaks.length) }));
  parts.push(t('stock.priceLevel.clients', { n: String(contacts.filter(c => c.priceLevelId === level.id).length) }));
  return parts.join(' · ');
}

export function renderPriceLevelsTab(panel, data) {
  const list = h('div', { class: 'stock-warehouses' });
  function draw() {
    while (list.firstChild) list.removeChild(list.firstChild);
    if (!data.priceLevels.length) {
      list.append(emptyState({ title: t('stock.priceLevel.empty.title'), text: t('stock.priceLevel.empty.text'), iconName: 'receipt', actionLabel: t('stock.priceLevel.new'), onAction: () => openLevelForm() }));
      return;
    }
    for (const level of data.priceLevels) {
      list.append(h('article', { class: 'card stock-warehouse' },
        h('div', { class: 'stock-warehouse-text' }, h('h3', {}, level.name), h('p', { class: 'muted' }, describe(level, data.contacts))),
        h('div', { class: 'stock-warehouse-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openLevelPrices(level, data.items) }, icon('receipt'), t('stock.priceLevel.prices')),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => openLevelForm(level) }, icon('pencil-line'), t('stock.priceLevel.edit')),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => askRemove(level) }, icon('x'), t('stock.priceLevel.remove')))));
    }
    refreshIcons(list);
  }
  panel.append(h('p', { class: 'muted' }, t('stock.priceLevel.intro')),
    h('div', { class: 'stock-filters' }, h('button', { type: 'button', class: 'btn btn-primary', onclick: () => openLevelForm() }, icon('plus'), t('stock.priceLevel.new'))), list);
  refreshIcons(panel);
  draw();
  return { refresh(next) { data = next; draw(); } };
}
