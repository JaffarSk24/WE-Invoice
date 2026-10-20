// The bank path end to end (WP-BANK): a company with an open invoice is
// put into the device store, a CSV statement of Tatra banka is imported
// through the file picker, the matching dialog proposes the invoice by its
// variable symbol and amount, and after confirming the invoice is paid.
// Importing the same statement again adds nothing.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const NOW = '2026-10-01T08:00:00.000Z';
const COMPANY_ID = '0192a000-0000-7000-8000-000000000001';
const ACCOUNT_ID = 'acc-main';
const INVOICE_ID = '0192a000-0000-7000-8000-000000000101';
const STATEMENT = readFileSync(new URL('../fixtures/bank/csv/tatra.csv', import.meta.url));

function seed() {
  const company = {
    id: COMPANY_ID, createdAt: NOW, updatedAt: NOW, name: 'Vzorova firma s.r.o.', legalForm: 'SRO', taxpayerType: 'PO',
    ico: '12345679', vatMode: 'NONPAYER', usesEkasa: false, address: { street: 'Hlavna 1', city: 'Bratislava', zip: '81101', country: 'SK' },
    bankAccounts: [{ id: ACCOUNT_ID, name: 'Tatra', iban: 'SK3911000000002900123456', bic: 'TATRSKBX', currency: 'EUR', isDefault: true }],
    series: [], defaults: { currency: 'EUR', language: 'sk' }, onboardedAt: NOW
  };
  const invoice = {
    id: INVOICE_ID, createdAt: NOW, updatedAt: NOW, kind: 'INVOICE', status: 'ISSUED', number: 'FA20260001', vs: '20260001',
    issueDate: '2026-09-20', dueDate: '2026-10-04', currency: 'EUR', contactId: null, buyer: { name: 'Alfa s.r.o.' },
    lines: [{ id: 'l1', kind: 'ITEM', name: 'Sluzby', qty: '1', unitPrice: '1230.00', priceType: 'NET', vatCategory: 'O', vatRate: null }],
    totals: { net: '1230.00', vat: '0.00', gross: '1230.00', payable: '1230.00' }, payments: []
  };
  const data = { schemaVersion: 1, companyId: COMPANY_ID, updatedAt: NOW, company };
  ['contacts', 'items', 'priceLevels', 'documents', 'recurringTemplates', 'bankTransactions', 'cashBooks', 'warehouses', 'stockMoves',
    'ledgerEntries', 'assets', 'trips', 'reminderPolicies', 'emailTemplates', 'auditLog'].forEach(c => { data[c] = []; });
  data.documents = [invoice];
  const workspace = {
    schemaVersion: 1, workspaceId: 'ws-e2e', updatedAt: NOW, companies: [{ id: COMPANY_ID, name: company.name, folderId: null, updatedAt: NOW }],
    activeCompanyId: COMPANY_ID, keys: null, settings: {}, betaToken: null
  };
  return { workspace, data };
}

async function putFiles(page, files) {
  await page.evaluate(async (entries) => {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('we-invoice', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      entries.forEach(([key, value]) => tx.objectStore('files').put(value, key));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, files);
}

async function readCompanyData(page) {
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
    return JSON.parse(text);
  }, `company:${COMPANY_ID}`);
}

async function importStatement(page) {
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.view-actions .btn-primary').click();
  await (await chooser).setFiles({ name: 'tatra.csv', mimeType: 'text/csv', buffer: STATEMENT });
  await expect(page.locator('.modal-content')).toBeVisible();
}

test('import a CSV statement, match it and the invoice is paid', async ({ page }) => {
  await page.goto('./');
  // Wait until the app has started: its first run writes an empty workspace,
  // which would otherwise land over the seed.
  await expect(page.locator('main#main h1')).toBeVisible();
  const { workspace, data } = seed();
  await putFiles(page, [['workspace', JSON.stringify(workspace)], [`company:${COMPANY_ID}`, JSON.stringify(data)]]);
  await page.goto('./#/bank');
  await page.reload();
  await expect(page.locator('main h1, .view-header h1').first()).toHaveText('Banka');

  await importStatement(page);
  await expect(page.locator('.import-body')).toContainText('3 pohyby: nové 3, už importované 0.');
  await expect(page.locator('.import-body select').first()).toHaveValue('tatra');
  await page.locator('.modal-actions .btn-primary').click();

  const match = page.locator('.modal-content', { hasText: 'Párovanie platieb' });
  await expect(match).toBeVisible();
  await expect(match.locator('.match-row')).toHaveCount(1);
  await expect(match.locator('.match-row select option:checked')).toContainText('FA20260001');
  await expect(match.locator('.match-why')).toContainText('sedí variabilný symbol');
  await expect(match.locator('.match-check')).toBeChecked();
  await match.locator('.modal-actions .btn-primary').click();

  await expect.poll(async () => {
    const stored = await readCompanyData(page);
    const doc = stored.documents.find(d => d.id === INVOICE_ID);
    return [doc.status, doc.payments.length, doc.payments[0]?.source, stored.bankTransactions.length];
  }).toEqual(['PAID', 1, 'BANK_IMPORT', 3]);
  await expect(page.locator('.match-state.is-matched').first()).toBeVisible();

  // The same statement again: nothing new.
  await importStatement(page);
  await expect(page.locator('.import-body')).toContainText('3 pohyby: nové 0, už importované 3.');
  await expect(page.locator('.modal-actions .btn-primary')).toBeDisabled();
  await page.locator('.modal-actions .btn', { hasText: 'Zrušiť' }).click();

  await page.goto('./#/payments');
  await expect(page.locator('.data-table')).toContainText('FA20260001');
});
