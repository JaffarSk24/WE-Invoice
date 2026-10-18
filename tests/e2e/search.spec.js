// Global search (03-features.md § 3.16): an invoice stored in the device
// data is found by its variable symbol and opens on its list route. On a
// desktop through the Ctrl/Cmd+K dialog, on a phone through the search
// screen. The data is written into the browser store before the app
// starts, the way a synced company would arrive.
import { test, expect } from '@playwright/test';

const COMPANY_ID = 'e2e-company';
const INVOICE_ID = 'e2e-invoice-42';
const NOW = '2026-10-01T08:00:00.000Z';

function seed() {
  const company = {
    id: COMPANY_ID, createdAt: NOW, updatedAt: NOW, name: 'Testovacia s. r. o.', legalForm: 'SRO', taxpayerType: 'PO',
    vatMode: 'PAYER', accountingMode: 'NONE', onboardedAt: NOW
  };
  const invoice = (id, number, vs, buyer) => ({
    id, createdAt: NOW, updatedAt: NOW, kind: 'INVOICE', status: 'ISSUED', number, vs, currency: 'EUR',
    issueDate: '2026-10-01', taxDate: '2026-10-01', dueDate: '2026-10-15', buyer: { name: buyer }, lines: [],
    totals: { net: '1000.00', vat: '230.00', gross: '1230.00', payable: '1230.00' }, payments: []
  });
  const data = {
    schemaVersion: 1, companyId: COMPANY_ID, company, updatedAt: NOW,
    documents: [invoice('e2e-invoice-41', 'FA2026041', '2026041', 'Alfa a. s.'), invoice(INVOICE_ID, 'FA2026042', '2026042', 'Beta s. r. o.')]
  };
  const workspace = {
    schemaVersion: 1, workspaceId: 'e2e-workspace', updatedAt: NOW, activeCompanyId: COMPANY_ID, settings: {}, keys: null,
    companies: [{ id: COMPANY_ID, name: company.name, folderId: null, updatedAt: NOW }]
  };
  return { workspace: JSON.stringify(workspace), company: JSON.stringify(data) };
}

async function writeStore(page) {
  const files = seed();
  await page.evaluate(({ files, companyKey }) => new Promise((resolve, reject) => {
    const req = indexedDB.open('we-invoice', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(files.workspace, 'workspace');
      tx.objectStore('files').put(files.company, companyKey);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { files, companyKey: `company:${COMPANY_ID}` });
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('main#main h1')).toBeVisible();
  await writeStore(page);
  await page.reload();
  await expect(page.locator('main#main h1')).toBeVisible();
});

test('Ctrl+K finds an invoice by its variable symbol and opens it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard shortcut on the desktop');
  await page.keyboard.press('Control+k');
  const input = page.locator('#global-search');
  await expect(input).toBeFocused();
  await input.fill('2026042');
  const hit = page.locator('#global-search-results .search-hit-button').first();
  await expect(hit).toContainText('FA2026042');
  await expect(hit).toContainText('Beta s. r. o.');
  await input.press('Enter');
  await expect(page).toHaveURL(new RegExp(`#/invoices/${INVOICE_ID}$`));
  await expect(page.locator('#global-search')).toHaveCount(0);
});

test('the search screen finds an invoice by its variable symbol and opens it', async ({ page }) => {
  await page.goto('./#/search?q=2026042');
  const hit = page.locator('.search-page-results .search-hit-button').first();
  await expect(hit).toContainText('FA2026042');
  await hit.click();
  await expect(page).toHaveURL(new RegExp(`#/invoices/${INVOICE_ID}$`));
});
