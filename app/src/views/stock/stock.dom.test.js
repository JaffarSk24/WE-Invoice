// @vitest-environment happy-dom
// The stock screen and the quick sale in a page: tabs and the levels
// table draw from the store, a scanned code fills the cart and "Sell"
// issues the receipt, shows the VRP2 data and lowers the stock.
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, memoryAdapter } from '../../store/index.js';
import { resetPrefsCache, setPref } from '../../prefs.js';
import { renderStock } from './index.js';
import { renderQuickSale } from './sale/index.js';
import { addMoves, ensureWarehouse, stockData } from './data.js';
import { levelRows } from './levels-tab.js';
import { t } from '../../i18n/index.js';

let store;
let item;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function until(check) {
  for (let i = 0; i < 100; i += 1) {
    if (check()) return;
    await tick();
  }
  throw new Error('condition not met');
}

beforeEach(async () => {
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '#/stock');
  localStorage.clear();
  resetPrefsCache();
  store = createStore({ adapter: memoryAdapter(), emitter: () => {} });
  await store.open();
  await store.createCompany({ name: 'Alfa, s. r. o.', legalForm: 'SRO', taxpayerType: 'PO', vatMode: 'PAYER', accountingMode: 'NONE', icDph: 'SK2020000004', defaults: { currency: 'EUR', language: 'sk' }, series: [] });
  item = await store.insert('items', { name: 'Farba biela', code: 'FB1', barcode: '8580000000017', unit: { code: 'C62', label: 'ks' }, price: '12.30', priceType: 'GROSS', vatCategory: 'S', vatRate: '23', currency: 'EUR', stockTracked: true });
  const warehouse = await ensureWarehouse();
  await addMoves([{ kind: 'RECEIPT', date: '2026-01-02', warehouseId: warehouse, itemId: item.id, qty: '5', unitCost: '6' }]);
});

describe('stock screen', () => {
  it('shows the tabs and the levels of the store', () => {
    const root = document.createElement('main');
    document.body.append(root);
    renderStock(root);
    expect(root.querySelector('h1').textContent).toBe(t('stock.title'));
    expect([...root.querySelectorAll('[role="tab"]')].map(b => b.dataset.tab)).toEqual(['levels', 'moves', 'inventory', 'warehouses', 'priceLevels']);
    expect(root.querySelector('.data-table').textContent).toContain('Farba biela');
    root.querySelector('[data-tab="warehouses"]').click();
    expect(root.querySelector('.stock-warehouse h3').textContent).toContain(t('stock.warehouse.defaultName'));
    expect(window.location.hash).toBe('#/stock/warehouses');
  });

  it('shows empty states in the demo', () => {
    setPref('demo', true);
    const root = document.createElement('main');
    document.body.append(root);
    renderStock(root);
    expect(root.querySelector('.badge-demo')).not.toBe(null);
    expect(root.querySelector('.table-empty').hidden).toBe(false);
  });
});

describe('quick sale screen', () => {
  it('sells a scanned item and lowers the stock', async () => {
    const root = document.createElement('main');
    document.body.append(root);
    renderQuickSale(root);
    const search = root.querySelector('#sale-search');
    search.value = '8580000000017';
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    root.querySelector('[data-item]').click();
    expect(root.querySelectorAll('.sale-line')).toHaveLength(1);
    expect(root.querySelector('.sale-qty').value).toBe('2');
    expect(root.querySelector('#sale-payable').textContent).toMatch(/24[.,]60/);
    root.querySelector('#sale-sell').click();
    await until(() => document.querySelector('#stock-vrp-number'));
    expect(document.querySelector('#stock-vrp-number').textContent).toMatch(/^PR\d{4}0001$/);
    expect(root.querySelectorAll('.sale-line')).toHaveLength(0);
    expect(levelRows(stockData()).find(r => r.id === item.id).qty).toBe('3');
  });

  it('shows no VRP2 hint nor VRP2 data for a company that does not use eKasa', async () => {
    await store.updateCompany({ ekasaExempt: true });
    const root = document.createElement('main');
    document.body.append(root);
    renderQuickSale(root);
    expect(root.querySelector('#sale-vrp-hint').hidden).toBe(true);
    root.querySelector('[data-item]').click();
    root.querySelector('#sale-sell').click();
    await until(() => document.querySelector('.toast-success'));
    expect(document.querySelector('.toast-success').textContent).toMatch(/PR\d{4}0001/);
    expect(document.querySelector('#stock-vrp')).toBe(null);
  });

  it('shows the VRP2 hint by default', () => {
    const root = document.createElement('main');
    document.body.append(root);
    renderQuickSale(root);
    expect(root.querySelector('#sale-vrp-hint').hidden).toBe(false);
  });

  it('sells a reverse-charge line only with the buyer IČ DPH and shows it for VRP2', async () => {
    await store.insert('contacts', { kind: 'COMPANY', name: 'Beta, s. r. o.', icDph: 'SK2020000004', country: 'SK' });
    const root = document.createElement('main');
    document.body.append(root);
    renderQuickSale(root);
    root.querySelector('[data-item]').click();
    expect(root.querySelector('#sale-buyer').hidden).toBe(true);
    const vat = root.querySelector('select.sale-vat');
    expect([...vat.options].map(o => o.value)).toEqual(expect.arrayContaining(['S:23', 'AE', 'E']));
    vat.value = 'AE';
    vat.dispatchEvent(new Event('change'));
    expect(root.querySelector('#sale-buyer').hidden).toBe(false);
    expect(root.querySelector('#sale-payable').textContent).toMatch(/10[.,]00/);
    root.querySelector('#sale-sell').click();
    await until(() => root.querySelector('#sale-buyer-name-error') && !root.querySelector('#sale-buyer-name-error').hidden);
    expect(document.querySelector('#stock-vrp')).toBe(null);
    const pick = root.querySelector('#sale-buyer-pick');
    pick.value = pick.options[1].value;
    pick.dispatchEvent(new Event('change'));
    expect(root.querySelector('#sale-buyer-icdph').value).toBe('SK2020000004');
    root.querySelector('#sale-sell').click();
    await until(() => document.querySelector('#stock-vrp-buyer'));
    expect(document.querySelector('#stock-vrp-buyer').textContent).toBe('Beta, s. r. o., SK2020000004');
    expect(document.querySelector('#stock-vrp td[data-category="AE"]').textContent).toBe(t('vat.category.AE'));
    expect(document.querySelector('#stock-vrp-reverse-charge')).not.toBe(null);
    const receipt = store.list('documents').find(d => d.kind === 'SALES_RECEIPT');
    expect(receipt.buyer).toMatchObject({ name: 'Beta, s. r. o.', icDph: 'SK2020000004' });
    expect(receipt.lines[0]).toMatchObject({ vatCategory: 'AE', vatRate: '0', exemptionReasonCode: 'VATEX-EU-AE' });
  });
});
