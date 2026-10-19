// The quick sale screen (route #/quick-sale, predajka, § 3.6): items on the
// left (search, or a USB barcode scanner that types the code and Enter),
// the cart on the right with quantities, totals, cash or card and an
// optional partial payment. "Sell" issues the receipt, moves the stock and
// shows what to type into the virtual cash register.
import { ekasaExempt } from '@we-invoice/core';
import { h, icon, append, clear } from '../../../ui/dom.js';
import { refreshIcons } from '../../../ui/icons.js';
import { t } from '../../../i18n/index.js';
import { on } from '../../../events.js';
import { todayLocal } from '../../../components/dates.js';
import { parseDecimal, toInputText } from '../../../components/decimal.js';
import { emptyState } from '../../../components/empty-state.js';
import { showToast, showError } from '../../../ui/toast.js';
import { isDemo } from '../../shell/demo-mode.js';
import { stockData } from '../data.js';
import { moneyText, nameIndex, unitLabel, refuseWrite, qtyText } from '../format.js';
import { emptyCart, addToCart, setCartQty, changeCartQty, removeFromCart, findByCode, searchItems, cartPreview } from './cart.js';
import { checkout } from './checkout.js';
import { openSaleSummary } from './summary.js';

const sellable = (items) => items.filter(i => /^\d+(\.\d+)?$/.test(String(i.price ?? '')));
let unsubscribe = [];

export function renderQuickSale(root) {
  unsubscribe.forEach(off => off());
  unsubscribe = [];
  let data = stockData();
  const vrpHint = h('p', { class: 'field-hint', id: 'sale-vrp-hint', hidden: ekasaExempt(data.company) }, t('stock.sale.vrpHint'));
  const state = { cart: emptyCart(), query: '', method: 'CASH', paid: '', warehouseId: '', busy: false };

  const search = h('input', {
    type: 'search', id: 'sale-search', placeholder: t('stock.sale.search'), 'aria-label': t('stock.sale.search'), autocomplete: 'off',
    oninput: (e) => { state.query = e.target.value; drawItems(); },
    onkeydown: (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const items = sellable(data.items);
      const hit = findByCode(items, search.value) || (searchItems(items, search.value).length === 1 ? searchItems(items, search.value)[0] : null);
      if (!hit) { showToast(t('stock.sale.notFound', { code: search.value }), { type: 'info' }); return; }
      add(hit);
      search.value = '';
      state.query = '';
      drawItems();
    }
  });
  const itemsBox = h('div', { class: 'sale-items', role: 'list' });
  const cartBox = h('div', { class: 'sale-cart-lines' });
  const totalsBox = h('dl', { class: 'sale-totals', 'aria-live': 'polite' });
  const paid = h('input', {
    type: 'text', inputmode: 'decimal', id: 'sale-paid', class: 'num', placeholder: t('stock.sale.paidPlaceholder'),
    oninput: (e) => { state.paid = e.target.value; }
  });
  const methodGroup = h('div', { class: 'segmented', role: 'group', 'aria-label': t('stock.sale.method') });
  const warehouse = h('select', { id: 'sale-warehouse', 'aria-label': t('stock.filter.warehouse'), onchange: (e) => { state.warehouseId = e.target.value; } });
  const warehouseField = h('label', { class: 'sale-warehouse' }, h('span', {}, t('stock.move.warehouse')), warehouse);
  const sell = h('button', { type: 'button', class: 'btn btn-primary sale-sell', id: 'sale-sell', onclick: () => finish() }, icon('banknote'), t('stock.sale.sell'));

  function add(item) {
    state.cart = addToCart(state.cart, item);
    drawCart();
  }

  function drawItems() {
    itemsBox.replaceChildren();
    const items = searchItems(sellable(data.items), state.query);
    // A list only while it holds items; the empty state is not a list item.
    if (items.length) itemsBox.setAttribute('role', 'list'); else itemsBox.removeAttribute('role');
    if (!items.length) {
      itemsBox.append(emptyState({ title: t('stock.sale.noItems.title'), text: t('stock.sale.noItems.text'), iconName: 'shopping-cart' }));
      refreshIcons(itemsBox);
      return;
    }
    for (const item of items) {
      append(itemsBox, [h('button', { type: 'button', class: 'sale-item', role: 'listitem', dataset: { item: item.id }, onclick: () => add(item) },
        h('span', { class: 'sale-item-name' }, item.name),
        h('span', { class: 'sale-item-price' }, moneyText(item.price, item.currency || 'EUR'), item.priceType === 'NET' ? h('span', { class: 'muted' }, ` ${t('stock.sale.net')}`) : null))]);
    }
  }

  function drawMethods() {
    methodGroup.replaceChildren(...['CASH', 'CARD'].map(m => h('button', {
      type: 'button', class: 'segment', 'aria-pressed': state.method === m ? 'true' : 'false', dataset: { method: m },
      onclick: () => { state.method = m; drawMethods(); drawCart(); }
    }, t(`stock.sale.method.${m}`))));
  }

  function drawWarehouses() {
    warehouse.replaceChildren(...data.warehouses.map(w => h('option', { value: w.id, selected: w.id === state.warehouseId }, w.name)));
    if (!data.warehouses.some(w => w.id === state.warehouseId)) state.warehouseId = data.warehouses[0]?.id || '';
    warehouseField.hidden = data.warehouses.length < 2;
  }

  function drawCart() {
    cartBox.replaceChildren();
    let preview;
    try { preview = cartPreview(state.cart, { company: data.company, date: todayLocal(), method: state.method }); } catch (e) { showError(e); preview = cartPreview([], {}); }
    if (!state.cart.length) cartBox.append(h('p', { class: 'muted sale-cart-empty' }, t('stock.sale.cartEmpty')));
    const totals = new Map(preview.lines.map(l => [l.itemId, l.total]));
    for (const entry of state.cart) {
      const qty = h('input', {
        type: 'text', inputmode: 'decimal', class: 'num sale-qty', value: toInputText(entry.qty), 'aria-label': t('stock.sale.qtyFor', { item: entry.item.name }),
        onchange: (e) => { const parsed = parseDecimal(e.target.value); state.cart = setCartQty(state.cart, entry.item.id, parsed ?? entry.qty); drawCart(); }
      });
      cartBox.append(h('div', { class: 'sale-line', dataset: { item: entry.item.id } },
        h('div', { class: 'sale-line-name' }, entry.item.name, h('span', { class: 'muted' }, ` ${unitLabel(entry.item)}`)),
        h('div', { class: 'sale-line-qty' },
          h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': t('stock.sale.less'), onclick: () => { state.cart = changeCartQty(state.cart, entry.item.id, '-1'); drawCart(); } }, icon('chevron-left')),
          qty,
          h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': t('stock.sale.more'), onclick: () => { state.cart = changeCartQty(state.cart, entry.item.id, '1'); drawCart(); } }, icon('chevron-right'))),
        h('div', { class: 'sale-line-total num' }, moneyText(totals.get(entry.item.id) || '0')),
        h('button', { type: 'button', class: 'btn btn-ghost btn-icon btn-sm', 'aria-label': t('stock.sale.remove'), onclick: () => { state.cart = removeFromCart(state.cart, entry.item.id); drawCart(); } }, icon('x'))));
    }
    append(clear(totalsBox), [
      h('dt', {}, t('stock.sale.vat')), h('dd', {}, moneyText(preview.vat)),
      h('dt', {}, t('stock.sale.total')), h('dd', {}, moneyText(preview.gross)),
      preview.rounding !== '0.00' ? [h('dt', {}, t('stock.sale.rounding')), h('dd', {}, moneyText(preview.rounding))] : null,
      h('dt', { class: 'sale-payable-label' }, t('stock.sale.payable')), h('dd', { class: 'sale-payable', id: 'sale-payable' }, moneyText(preview.payable))]);
    sell.disabled = !state.cart.length || state.busy;
    refreshIcons(cartBox);
  }

  function saleDone(document, warnings) {
    showToast(t('stock.sale.done', { number: document.number || '' }), { type: 'success' });
    const names = nameIndex(data.items);
    warnings.forEach(w => showToast(t('stock.warning.negative', { item: names(w.itemId), qty: qtyText(w.qty) }), { type: 'info', duration: 8000 }));
  }

  async function finish() {
    if (!state.cart.length || state.busy || refuseWrite()) return;
    const paidAmount = state.paid.trim() ? parseDecimal(state.paid) : null;
    if (state.paid.trim() && (paidAmount === null || paidAmount.startsWith('-'))) { showToast(t('stock.sale.badPaid'), { type: 'error' }); paid.focus(); return; }
    state.busy = true;
    drawCart();
    try {
      const { document, warnings } = await checkout(state.cart, { method: state.method, paid: paidAmount, warehouseId: state.warehouseId || null });
      state.cart = emptyCart();
      state.paid = '';
      paid.value = '';
      // A company without eKasa gets no VRP2 data to copy, only the confirmation.
      if (ekasaExempt(data.company)) saleDone(document, warnings);
      else openSaleSummary(document, { warnings, itemName: nameIndex(data.items) });
    } catch (e) {
      showError(e, 'stock.error.sale');
    } finally {
      state.busy = false;
      drawCart();
    }
  }

  append(root, [
    h('header', { class: 'view-header' }, h('h1', {}, t('stock.sale.title')),
      h('div', { class: 'view-actions' }, isDemo() ? h('span', { class: 'badge badge-demo' }, t('stock.demo.badge')) : null)),
    h('div', { class: 'sale-layout' },
      h('section', { class: 'card sale-catalog', 'aria-label': t('stock.sale.catalog') }, search, itemsBox),
      h('section', { class: 'card sale-cart', 'aria-label': t('stock.sale.cart') },
        h('h2', {}, t('stock.sale.cart')), cartBox, totalsBox, methodGroup,
        h('label', { class: 'sale-paid-field', for: 'sale-paid' }, h('span', {}, t('stock.sale.paidLabel')), paid),
        warehouseField, sell,
        vrpHint))]);
  drawItems();
  drawMethods();
  drawWarehouses();
  drawCart();
  refreshIcons(root);
  setTimeout(() => search.focus(), 0);

  const refresh = () => {
    if (!root.isConnected) return;
    data = stockData();
    vrpHint.hidden = ekasaExempt(data.company);
    drawItems();
    drawWarehouses();
  };
  unsubscribe.push(on('data:changed', (e) => { if (!e || ['items', 'warehouses', 'company', null].includes(e.collection ?? null)) refresh(); }));
  ['company:switched', 'demo:enabled', 'demo:disabled'].forEach(ev => unsubscribe.push(on(ev, refresh)));
}
