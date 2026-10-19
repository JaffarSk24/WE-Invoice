// @vitest-environment happy-dom
// The tax screens over a store in memory: the VAT records with closing of
// the period, the kontrolný výkaz with the XML download and the "filed"
// mark, an export blocked by errors, the súhrnný výkaz with the VIES check,
// the VAT return rows and the sample data mode that writes nothing.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createStore, memoryAdapter } from '../../store/index.js';
import { applySwitched, resetCompanyState, initCompanyState } from '../shell/company-state.js';
import { enableDemo, disableDemo } from '../shell/demo-mode.js';
import { resetPrefsCache } from '../../prefs.js';
import { registerTaxRoutes } from './index.js';
import { rememberPeriod, defaultPeriod, documentHref, demoTaxDocuments } from './data.js';
import { reportFileName } from './actions.js';
import { setLanguage } from '../../i18n/index.js';
import { boot, TAX_ROUTE_NAMES } from '../../boot/tax.js';

// happy-dom replaces import.meta.url, so fixtures are read from the repository root.
const FIXTURES = join(process.cwd(), 'tests/fixtures/tax');
const fixture = (name) => JSON.parse(readFileSync(join(FIXTURES, name, 'input.json'), 'utf8'));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function setup(name, period = '2026-03') {
  const input = fixture(name);
  const store = createStore({ adapter: memoryAdapter(), emitter: () => {} });
  await store.open();
  const fields = { ...input.company };
  ['id', 'createdAt', 'updatedAt'].forEach(k => delete fields[k]);
  await store.createCompany(fields);
  for (const document of input.documents) await store.insert('documents', document);
  applySwitched(store.switchedPayload());
  rememberPeriod(store.company(), period);
  const routes = {};
  const transport = {
    files: { saveAs: vi.fn(async () => {}) },
    gatewayUrl: (p) => `https://gw.test${p}`,
    http: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ valid: true, checkedAt: '2026-04-01T00:00:00Z' }) }))
  };
  registerTaxRoutes({ registerRoute: (route, render) => { routes[route] = render; }, transport });
  const show = async (route) => {
    const root = document.createElement('main');
    document.body.append(root);
    routes[route](root, route);
    await tick();
    return root;
  };
  return { store, transport, show };
}

function clickModalPrimary() {
  const button = document.querySelector('.modal-overlay [data-primary]');
  expect(button).toBeTruthy();
  button.click();
}

function buttonWithText(root, text) {
  return Array.from(root.querySelectorAll('button')).find(b => b.textContent.includes(text));
}

beforeAll(async () => {
  await setLanguage('sk');
});

beforeEach(() => {
  localStorage.clear();
  resetPrefsCache();
  document.body.innerHTML = '';
  resetCompanyState();
  initCompanyState();
});

describe('tax boot', () => {
  it('registers the four routes and loads the screens on first use', async () => {
    const routes = {};
    await boot({ registerRoute: (name, render) => { routes[name] = render; }, showError: vi.fn(), transport: {} });
    expect(Object.keys(routes)).toEqual([...TAX_ROUTE_NAMES]);
    const root = document.createElement('main');
    document.body.append(root);
    routes.kv(root, 'kv');
    await vi.waitFor(() => expect(root.querySelector('h1')).toBeTruthy());
  });
});

describe('tax screen helpers', () => {
  it('links documents to their screens and names report files', () => {
    expect(documentHref('INVOICE', 'a b')).toBe('#/invoices/a%20b');
    expect(documentHref('RECEIVED_INVOICE', 'x')).toBe('#/received/x');
    expect(documentHref('QUOTE', 'x')).toBe(null);
    expect(reportFileName('kv', { icDph: 'SK 2020123457' }, '2026-03', 'R')).toBe('KV_DPH_SK2020123457_2026-03_R.xml');
    expect(reportFileName('vatReturn', {}, '2026-Q1', 'D')).toBe('DP_DPH_NA_2026-Q1_D.xml');
  });

  it('offers the last finished period, by the company period kind', () => {
    expect(defaultPeriod({ id: 'a', vatPeriod: 'MONTH' }, '2026-04-10')).toBe('2026-03');
    expect(defaultPeriod({ id: 'a', vatPeriod: 'QUARTER' }, '2026-04-10')).toBe('2026-Q1');
    rememberPeriod({ id: 'a' }, '2025-11');
    expect(defaultPeriod({ id: 'a', vatPeriod: 'MONTH' }, '2026-04-10')).toBe('2025-11');
    expect(defaultPeriod({ id: 'a', vatPeriod: 'QUARTER' }, '2026-04-10')).toBe('2026-Q1');
  });

  it('adapts the sample documents to the shape of the records', () => {
    const docs = demoTaxDocuments({
      company: { name: 'Demo', icDph: 'SK2020000004', address: { country: 'SK' } },
      contacts: [{ id: 'c1' }],
      documents: [{ id: 'd1', kind: 'RECEIVED_INVOICE', status: 'PAID', number: 'PF1', issueDate: '2026-03-01', contactId: 'c1', contactName: 'Alfa', totalNet: '100.00', totalVat: '23.00', totalGross: '123.00' }]
    });
    expect(docs[0]).toMatchObject({ receivedDate: '2026-03-01', seller: { icDph: 'SK2020123457' }, totals: { breakdown: [{ base: '100.00', vat: '23.00' }] } });
  });
});

describe('VAT records screen', () => {
  it('shows the totals, the documents and the checks of the period', async () => {
    const { show } = await setup('01-monthly-domestic');
    const root = await show('vat-records');
    const tiles = Array.from(root.querySelectorAll('.tax-tile-value')).map(el => el.textContent);
    expect(tiles).toHaveLength(4);
    expect(tiles[3]).toBe('7');
    expect(root.querySelector('.tax-disclaimer')).toBeTruthy();
    expect(root.querySelectorAll('.tax-problem.is-warning')).toHaveLength(1);
    expect(root.querySelector('.tax-problem-link').getAttribute('href')).toBe('#/invoices/fa2026006');
    expect(root.querySelectorAll('.tab-panel:not([hidden]) tbody tr')).toHaveLength(6);
  });

  it('closes the period through the store and writes the audit entry', async () => {
    const { show, store } = await setup('01-monthly-domestic');
    const root = await show('vat-records');
    buttonWithText(root, 'Uzavrieť obdobie').click();
    await tick();
    clickModalPrimary();
    await tick();
    await tick();
    expect(store.company().closedPeriods).toEqual(['2026-03']);
    expect(store.list('auditLog').map(e => e.action)).toEqual(['PERIOD_CLOSE']);
  });

  it('moves to the previous period', async () => {
    const { show } = await setup('01-monthly-domestic');
    const root = await show('vat-records');
    root.querySelector('.tax-period button').click();
    await tick();
    expect(root.querySelector('.tax-period-name').textContent).toMatch(/2026/);
    expect(root.querySelector('.tax-tile-value:last-child')).toBeTruthy();
    expect(Array.from(root.querySelectorAll('.tax-tile-value')).pop().textContent).toBe('0');
  });
});

describe('report screens', () => {
  it('previews the kontrolný výkaz, saves its XML and marks it filed', async () => {
    const { show, store, transport } = await setup('01-monthly-domestic');
    const root = await show('kv');
    expect(root.querySelectorAll('.tax-section')).toHaveLength(9);
    expect(root.querySelector('.tax-section tbody').children).toHaveLength(4);
    const download = buttonWithText(root, 'Stiahnuť XML');
    expect(download.disabled).toBe(false);
    download.click();
    await tick();
    await tick();
    expect(transport.files.saveAs).toHaveBeenCalledTimes(1);
    expect(transport.files.saveAs.mock.calls[0][0]).toBe('KV_DPH_SK2020123457_2026-03_R.xml');
    const xml = await transport.files.saveAs.mock.calls[0][1].text();
    expect(xml).toBe(readFileSync(join(FIXTURES, '01-monthly-domestic/kv.xml'), 'utf8'));
    buttonWithText(root, 'Označiť ako podané').click();
    await tick();
    clickModalPrimary();
    await tick();
    await tick();
    expect(store.list('auditLog').map(e => e.changes[0].to)).toEqual(['DOWNLOADED', 'FILED']);
    expect(root.querySelector('.tax-filing').textContent).toMatch(/Podané/);
  });

  it('blocks the XML while the checks find errors', async () => {
    const { show } = await setup('11-problems');
    const root = await show('kv');
    expect(buttonWithText(root, 'Stiahnuť XML').disabled).toBe(true);
    expect(root.querySelectorAll('.tax-problem.is-error').length).toBeGreaterThanOrEqual(7);
  });

  it('checks buyers of the súhrnný výkaz in VIES and switches to a quarter', async () => {
    const { show, transport } = await setup('05-eu-goods');
    const root = await show('sv');
    expect(root.querySelectorAll('.tax-problem.is-warning')).toHaveLength(2);
    buttonWithText(root, 'VIES').click();
    await tick();
    await tick();
    expect(transport.http).toHaveBeenCalledTimes(2);
    expect(transport.http.mock.calls[0][0].url).toBe('https://gw.test/v1/vat/vies/DE/123456789');
    expect(root.querySelectorAll('.tax-problem.is-warning')).toHaveLength(0);
    const kind = root.querySelector('.tax-period-kind');
    kind.value = 'QUARTER';
    kind.dispatchEvent(new Event('change'));
    await tick();
    expect(root.querySelector('.tax-period-name').textContent).toMatch(/1\. štvrťrok 2026/);
  });

  it('lists the rows of the VAT return with their meaning', async () => {
    const { show } = await setup('01-monthly-domestic');
    const root = await show('vat-return');
    const rows = Array.from(root.querySelectorAll('.tax-preview tbody tr')).map(tr => tr.children[0].textContent);
    expect(rows).toEqual(['01', '01a', '02', '02a', '03', '04', '17', '18', '18a', '19', '31', '32', '35']);
    expect(root.querySelector('.tax-preview tbody tr td:nth-child(2)').textContent).toMatch(/19 %/);
  });
});

describe('sample data mode', () => {
  it('shows the sample company and writes nothing', async () => {
    const { show, store } = await setup('01-monthly-domestic');
    enableDemo();
    const root = await show('kv');
    expect(root.querySelector('.tax-preview')).toBeTruthy();
    buttonWithText(root, 'Označiť ako podané').click();
    await tick();
    expect(document.querySelector('.modal-overlay')).toBe(null);
    expect(document.querySelector('.toast-message').textContent).toMatch(/ukážkovom/);
    expect(store.list('auditLog')).toEqual([]);
    disableDemo();
  });
});
