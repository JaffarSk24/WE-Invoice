// Shared data steps of the end-to-end tests: companies, contacts, items
// and documents are written straight into the device store (IndexedDB
// "we-invoice", one file per company) where the app reads them at start,
// and read back to check what a screen stored. Seeding takes a second,
// where the "My company" wizard takes twenty on the emulated phones, so
// tests that are not about the wizard start from here.
import { expect } from '@playwright/test';

export const NOW = '2026-10-18T08:00:00.000Z';

const COLLECTIONS = ['contacts', 'items', 'priceLevels', 'documents', 'recurringTemplates', 'bankTransactions', 'cashBooks', 'warehouses',
  'stockMoves', 'ledgerEntries', 'assets', 'trips', 'reminderPolicies', 'emailTemplates', 'auditLog'];

// A VAT payer sole trader with simple bookkeeping (jednoduché účtovníctvo),
// so the cash book, the VAT records and the stock all have work to do.
// Identifiers are synthetic with valid checksums.
export function company(overrides = {}) {
  return {
    id: 'e2e-company-1', createdAt: NOW, updatedAt: NOW, name: 'Biela Orlica s.r.o.', legalForm: 'FO_ZIVNOST', taxpayerType: 'FO',
    ico: '36123455', dic: '1020123402', icDph: 'SK1020123402', vatMode: 'PAYER', vatPeriod: 'MONTH', cashBasis: false, oss: false,
    usesEkasa: false, accountingMode: 'SIMPLE', registerEntry: 'Živnostenský register OÚ Bratislava, č. 110-123456',
    address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' },
    bankAccounts: [{ id: 'acc-main', name: 'Tatra banka', iban: 'SK3911000000002900123456', bic: 'TATRSKBX', currency: 'EUR', isDefault: true }],
    email: 'faktury@biela-orlica.example', defaults: { dueDays: 14, currency: 'EUR', language: 'sk', secondLanguage: null, template: 'CLASSIC', paymentMethod: 'TRANSFER', roundingCash: false, texts: { intro: null, outro: null, footer: null } },
    series: [], closedPeriods: [], note: '', onboardedAt: NOW,
    ...overrides
  };
}

export function contact(overrides = {}) {
  return {
    id: 'e2e-contact-1', createdAt: NOW, updatedAt: NOW, kind: 'COMPANY', name: 'Beta Obchod, s. r. o.', ico: '35757442', dic: '2021234567',
    icDph: 'SK2021234567', country: 'SK', billingAddress: { street: 'Mlynská 5', city: 'Košice', zip: '040 01', country: 'SK' },
    emails: [{ address: 'uctaren@beta.example', purposes: ['INVOICE'] }], dueDays: 14, language: 'sk',
    ...overrides
  };
}

export function item(overrides = {}) {
  return {
    id: 'e2e-item-1', createdAt: NOW, updatedAt: NOW, name: 'Farba biela 5 l', code: 'FB5', unit: { code: 'C62', label: 'ks' }, price: '20.00',
    priceType: 'NET', vatCategory: 'S', vatRate: '23', currency: 'EUR', stockTracked: false, prices: {},
    ...overrides
  };
}

const ZERO_TOTALS = { lineNet: '0.00', allowances: '0.00', charges: '0.00', prepaid: '0.00', rounding: '0.00', vatEur: null };

/** An issued invoice of 500 EUR + 23 % VAT for the contact, with its totals. */
export function invoice(overrides = {}) {
  const c = overrides.contact || contact();
  const { contact: _c, ...rest } = overrides;
  void _c;
  const number = rest.number || 'FA20260001';
  return {
    id: `e2e-doc-${number}`, createdAt: NOW, updatedAt: NOW, kind: 'INVOICE', status: 'ISSUED', number, vs: number.replace(/\D/g, ''), currency: 'EUR',
    issueDate: '2026-10-01', taxDate: '2026-10-01', dueDate: '2026-10-15', language: 'sk', contactId: c.id, paymentMethod: 'TRANSFER', bankAccountId: 'acc-main',
    seller: { name: 'Biela Orlica s.r.o.', ico: '36123455', dic: '1020123402', icDph: 'SK1020123402', vatPayer: true, address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' } },
    buyer: { contactId: c.id, name: c.name, ico: c.ico, dic: c.dic, icDph: c.icDph, address: c.billingAddress, country: c.country },
    lines: [{ id: 'l1', kind: 'ITEM', name: 'Konzultácie', qty: '10', unit: { code: 'HUR', label: 'hod.' }, unitPrice: '50', priceType: 'NET', vatCategory: 'S', vatRate: '23' }],
    totals: { ...ZERO_TOTALS, lineNet: '500.00', net: '500.00', vat: '115.00', gross: '615.00', payable: '615.00', breakdown: [{ category: 'S', rate: '23', base: '500.00', vat: '115.00' }] },
    payments: [], sendLog: [], links: [], attachments: [], peppol: null, lockedAt: null, exportedAt: null,
    ...rest
  };
}

/** The data file of one company with the given collections filled. */
export function companyFile(co, records = {}) {
  const data = { schemaVersion: 1, companyId: co.id, updatedAt: NOW, company: co };
  COLLECTIONS.forEach(name => { data[name] = records[name] || []; });
  return data;
}

async function putFiles(page, entries) {
  await page.evaluate(async (files) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('we-invoice', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      files.forEach(([key, value]) => tx.objectStore('files').put(value, key));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, entries);
}

/**
 * Writes a workspace with the companies (each { company, ...collections })
 * and opens the app at the hash with the first company active.
 * @param {import('@playwright/test').Page} page
 * @param {Array<object>|object} files  one or more { company, contacts, documents, ... }
 */
export async function seed(page, files, { hash = '#/dashboard', prefs = {}, active = null } = {}) {
  const list = Array.isArray(files) ? files : [files];
  await page.goto('./');
  // The first run writes an empty workspace; the seed goes over it.
  await expect(page.locator('main h1').first()).toBeVisible();
  const workspace = {
    schemaVersion: 1, workspaceId: 'e2e-ws', updatedAt: NOW, keys: null, settings: {}, betaToken: null,
    companies: list.map(f => ({ id: f.company.id, name: f.company.name, folderId: null, updatedAt: NOW })),
    activeCompanyId: active || list[0].company.id
  };
  await page.evaluate((p) => localStorage.setItem('we-invoice-prefs', JSON.stringify({ onboardingDone: true, language: 'sk', ...p })), prefs);
  await putFiles(page, [['workspace', JSON.stringify(workspace)], ...list.map(({ company: co, ...records }) => [`company:${co.id}`, JSON.stringify(companyFile(co, records))])]);
  await page.goto(`./${hash}`);
  await page.reload();
  await expect(page.locator('#company-switcher option:checked')).toHaveText(workspace.companies.find(c => c.id === workspace.activeCompanyId).name);
}

/** The stored data file of a company. */
export async function readData(page, companyId = 'e2e-company-1') {
  return page.evaluate(async (key) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('we-invoice', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const text = await new Promise((resolve, reject) => {
      const req = db.transaction('files', 'readonly').objectStore('files').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return text ? JSON.parse(text) : null;
  }, `company:${companyId}`);
}

/** Records of a collection that are not deleted. */
export async function live(page, collection, companyId) {
  const data = await readData(page, companyId);
  return (data[collection] || []).filter(r => !r.deleted);
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS' };

/** A JSON answer with the CORS headers the gateway sends. */
export function json(route, body, status = 200) {
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
  return route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
}

/**
 * Every request to the gateway, Google or a provider is answered here, so
 * no test reaches the network: unknown paths get 404. Specific routes
 * added later win, as Playwright checks the last route first.
 */
export async function offline(page) {
  await page.route(/^https?:\/\/(?!localhost)/, route => json(route, { error: { code: 'NOT_FOUND' } }, 404));
}
