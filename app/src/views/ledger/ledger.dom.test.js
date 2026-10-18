// @vitest-environment happy-dom
// The ledger screens over a real store in memory: automatic entries from
// payments, the three routes in each accounting mode, the forms' checks,
// the closing inputs and the demo mode that writes nothing.
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore, memoryAdapter } from '../../store/index.js';
import { emit } from '../../events.js';
import { resetPrefsCache, setPref } from '../../prefs.js';
import { syncAutoEntries } from './auto-entries.js';
import { renderCashJournal } from './journal-view.js';
import { renderAssets } from './assets-view.js';
import { renderClosing } from './closing-view.js';
import { entryErrors, entryFields } from './entry-form.js';
import { tripErrors } from './trips-tab.js';
import { assetErrors, assetRecord } from './asset-form.js';
import { closingState, saveClosingState } from './closing-inputs.js';
import { bookDate } from './books-tab.js';
import { ledgerMode, ledgerYears } from './state.js';
import { setLedgerYear } from './kit.js';

const line = { id: 'l1', name: 'Služba', qty: '1', unitPrice: '1000', vatCategory: 'O', vatRate: null };
const invoice = {
  kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', number: '2026001', issueDate: '2026-02-01', buyer: { name: 'Odberateľ' }, lines: [line],
  payments: [{ id: 'p1', date: '2026-02-10', amount: '1000', method: 'TRANSFER', source: 'MANUAL' }]
};

async function storeWith(mode, extra = {}) {
  const store = createStore({ adapter: memoryAdapter(), emitter: emit });
  await store.open();
  await store.createCompany({ name: 'Ján Novák', legalForm: 'FO_ZIVNOST', taxpayerType: 'FO', vatMode: 'NONPAYER', accountingMode: mode, ...extra });
  return store;
}

function mount(render) {
  const root = document.createElement('main');
  document.body.append(root);
  render(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  resetPrefsCache();
  setLedgerYear(2026);
});

describe('automatic entries', () => {
  it('books a payment once and follows its changes', async () => {
    const store = await storeWith('SIMPLE');
    const doc = await store.insert('documents', invoice);
    expect(await syncAutoEntries(store)).toMatchObject({ inserted: 1 });
    expect(await syncAutoEntries(store)).toMatchObject({ inserted: 0, updated: 0, removed: 0 });
    await store.update('documents', doc.id, { payments: [] });
    expect(await syncAutoEntries(store)).toMatchObject({ removed: 1 });
    expect(store.list('ledgerEntries')).toEqual([]);
  });

  it('does nothing without bookkeeping', async () => {
    const store = await storeWith('NONE');
    await store.insert('documents', invoice);
    expect(await syncAutoEntries(store)).toMatchObject({ skipped: true });
  });
});

describe('screens', () => {
  it('shows the cash book with the booked payment', async () => {
    const store = await storeWith('SIMPLE');
    await store.insert('documents', invoice);
    await syncAutoEntries(store);
    const root = mount(renderCashJournal);
    expect(root.querySelector('h1').textContent).toBe('Cash journal');
    expect(root.textContent).toContain('Odberateľ');
    expect(root.querySelectorAll('[role="tab"]').length).toBe(3);
  });

  it('shows the tax records in the flat-rate mode', async () => {
    const store = await storeWith('TAX_RECORDS_FLAT');
    await store.insert('documents', invoice);
    await syncAutoEntries(store);
    const root = mount(renderCashJournal);
    expect(root.querySelector('h1').textContent).toBe('Tax records');
    expect(root.textContent).toContain('2026001');
  });

  it('explains the mode instead of the books', async () => {
    await storeWith('EXTERNAL');
    const root = mount(renderAssets);
    expect(root.querySelector('.empty-state h2').textContent).toBe('Your accountant keeps the books');
    await storeWith('NONE');
    const closing = mount(renderClosing);
    expect(closing.querySelector('.empty-state h2').textContent).toBe('You keep no books in the app');
  });

  it('lists assets with the depreciation of the year', async () => {
    const store = await storeWith('SIMPLE');
    await store.insert('assets', { name: 'Auto', kind: 'TANGIBLE', acquiredOn: '2026-01-10', cost: '24000', depreciationGroup: 1, method: 'STRAIGHT', plan: [] });
    const root = mount(renderAssets);
    expect(root.textContent).toContain('Auto');
    expect(root.textContent.replace(/\s/g, '')).toContain('6,000.00');
  });

  it('builds the closing with both statements and closes the year', async () => {
    const store = await storeWith('SIMPLE');
    await store.insert('documents', invoice);
    await syncAutoEntries(store);
    const root = mount(renderClosing);
    expect(root.querySelectorAll('.ledger-statement').length).toBe(2);
    expect(root.querySelectorAll('.ledger-check').length).toBeGreaterThanOrEqual(8);
    expect(root.querySelector('[data-action="close-year"]').disabled).toBe(false);
  });

  it('shows the demo books and writes nothing', async () => {
    const store = await storeWith('NONE');
    setPref('demo', true);
    expect(ledgerMode()).toBe('SIMPLE');
    const root = mount(renderCashJournal);
    expect(root.querySelector('[data-action="add"]').disabled).toBe(true);
    expect(store.list('ledgerEntries')).toEqual([]);
  });
});

describe('form checks', () => {
  it('checks an entry', () => {
    expect(entryErrors({ date: '2026-01-01', direction: 'INCOME', category: 'INCOME_TAX_GOODS', amount: '10' })).toEqual({});
    expect(entryErrors({ date: '', direction: 'INCOME', category: 'EXPENSE_TAX_GOODS', amount: '0' })).toEqual({ date: 'ledger.entry.error.date', amount: 'ledger.entry.error.amount', category: 'ledger.entry.error.category' });
    expect(entryErrors({ date: '2026-01-01', direction: 'TRANSFER', category: 'TRANSFER', amount: '-5' }).amount).toBe('ledger.entry.error.transferNegative');
    expect(entryErrors({ date: '2026-01-01', direction: 'EXPENSE', category: 'EXPENSE_TAX_GOODS', amount: '10', vat: '11' }, { payer: true }).vat).toBe('ledger.entry.error.vat');
  });

  it('builds entry fields', () => {
    const v = { date: '2026-01-01', direction: 'INCOME', medium: 'BANK', category: 'INCOME_TAX_OTHER', amount: '10', vat: '2', incomeParagraph: '6_4', number: '', text: 'x' };
    expect(entryFields(v, { payer: false, flat: true })).toMatchObject({ vat: null, auto: false, taxRelevant: true, incomeParagraph: '6_4', number: null });
    expect(entryFields(v, { payer: true }).vat).toBe('2');
  });

  it('checks a trip and an asset', () => {
    expect(tripErrors({ date: '2026-01-01', km: '10' })).toEqual({});
    expect(tripErrors({ date: 'x', km: '0', hours: -1 })).toEqual({ date: 'ledger.trip.error.date', km: 'ledger.trip.error.km', hours: 'ledger.trip.error.hours' });
    const asset = { name: 'PC', kind: 'TANGIBLE', acquiredOn: '2026-01-01', cost: '3000', depreciationGroup: '1', method: 'ACCELERATED' };
    expect(assetErrors(asset)).toEqual({ method: 'errors.LEDGER_ACCELERATED_NOT_ALLOWED' });
    expect(assetErrors({ ...asset, method: 'STRAIGHT', inUseFrom: '2025-12-31' })).toEqual({ inUseFrom: 'ledger.asset.error.inUse' });
    expect(assetRecord({ ...asset, inventoryNumber: '' })).toMatchObject({ depreciationGroup: 1, inventoryNumber: null, plan: [] });
  });
});

describe('helpers', () => {
  it('keeps the closing inputs per company and year', () => {
    saveClosingState('c1', 2026, { inputs: { cashCount: '10' } });
    expect(closingState('c1', 2026)).toEqual({ inputs: { cashCount: '10' }, closedAt: null });
    expect(closingState('c1', 2025).inputs).toEqual({});
  });

  it('reads the books at year end or today', () => {
    expect(bookDate(2025, '2026-03-01')).toBe('2025-12-31');
    expect(bookDate(2026, '2026-03-01')).toBe('2026-03-01');
  });

  it('offers the years with data', () => {
    expect(ledgerYears({ entries: [{ date: '2024-05-01' }], assets: [], trips: [] }, '2026-01-01')).toEqual([2026, 2025, 2024]);
  });
});
