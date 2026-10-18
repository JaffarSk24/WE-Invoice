// The stock screen (route #/stock, 03-features.md § 3.4): tabs for levels,
// the movement report, stocktaking, warehouses and price levels, and the
// actions for a receipt, an issue and a transfer typed in by hand. The
// tab is part of the address (#/stock/moves), so a link opens it. Every
// tab redraws when the data it reads changes, locally or by sync.
import { h, icon } from '../../ui/dom.js';
import { refreshIcons } from '../../ui/icons.js';
import { t } from '../../i18n/index.js';
import { on } from '../../events.js';
import { navigate } from '../../router.js';
import { createTabs } from '../../components/tabs.js';
import { isDemo } from '../shell/demo-mode.js';
import { stockData } from './data.js';
import { openMoveDialog } from './move-dialog.js';
import { renderLevelsTab } from './levels-tab.js';
import { renderMovesTab } from './moves-tab.js';
import { renderInventoryTab } from './inventory-tab.js';
import { renderWarehousesTab } from './warehouses-tab.js';
import { renderPriceLevelsTab } from './price-levels-tab.js';

export const STOCK_TABS = Object.freeze(['levels', 'moves', 'inventory', 'warehouses', 'priceLevels']);
const RENDER = {
  levels: renderLevelsTab, moves: renderMovesTab, inventory: renderInventoryTab, warehouses: renderWarehousesTab, priceLevels: renderPriceLevelsTab
};
const WATCHED = new Set(['stockMoves', 'warehouses', 'items', 'documents', 'priceLevels', 'contacts', 'company', null]);

/** The tab named in the address (#/stock/<tab>), levels by default. */
export function tabFromHash(hash) {
  const part = String(hash || '').replace(/^#\/?/, '').split(/[/?]/)[1] || '';
  return STOCK_TABS.includes(part) ? part : 'levels';
}

let unsubscribe = [];

export function renderStock(root) {
  unsubscribe.forEach(off => off());
  unsubscribe = [];
  const views = new Map();
  let data = stockData();

  const tabs = createTabs({
    active: tabFromHash(typeof window !== 'undefined' ? window.location.hash : ''),
    cls: 'stock-tabs',
    tabs: STOCK_TABS.map(id => ({ id, label: t(`stock.tab.${id}`), render: (panel) => views.set(id, RENDER[id](panel, data)) })),
    onChange: (id) => {
      const wanted = id === 'levels' ? '#/stock' : `#/stock/${id}`;
      if (typeof window !== 'undefined' && window.location.hash !== wanted) window.history.replaceState(null, '', wanted);
    }
  });

  const action = (kind, iconName, id) => h('button', { type: 'button', class: 'btn', id, onclick: () => openMoveDialog(kind) }, icon(iconName), t(`stock.action.${kind.toLowerCase()}`));
  root.append(
    h('header', { class: 'view-header' },
      h('h1', {}, t('stock.title')),
      h('div', { class: 'view-actions stock-header-actions' },
        isDemo() ? h('span', { class: 'badge badge-demo' }, t('stock.demo.badge')) : null,
        action('RECEIPT', 'arrow-down', 'stock-receipt'),
        action('ISSUE', 'arrow-up', 'stock-issue'),
        action('TRANSFER', 'truck', 'stock-transfer'),
        h('button', { type: 'button', class: 'btn btn-primary', id: 'stock-quick-sale', onclick: () => navigate('quick-sale') }, icon('shopping-cart'), t('stock.action.quickSale')))),
    tabs.el);
  refreshIcons(root);

  const redraw = () => {
    if (!root.isConnected) return;
    data = stockData();
    for (const view of views.values()) view.refresh(data);
  };
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    // Several writes in a row (a sale with many lines) redraw once.
    Promise.resolve().then(() => { pending = false; redraw(); });
  };
  unsubscribe.push(on('data:changed', (e) => { if (!e || WATCHED.has(e.collection ?? null)) schedule(); }));
  ['company:switched', 'demo:enabled', 'demo:disabled'].forEach(ev => unsubscribe.push(on(ev, schedule)));
}
