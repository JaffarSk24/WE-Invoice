// Shoptet orders come in as draft invoices: a company stored on the
// device, the XML order export picked in the import tab, the preview with
// the counts, the import, and the drafts with their customers and price
// list items in the stored data. A second import of the same file adds
// nothing.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const COMPANY_ID = 'e2e-shoptet-company';
const NOW = '2026-10-01T08:00:00.000Z';
const ORDERS = fileURLToPath(new URL('../fixtures/imports/shoptet/orders.xml', import.meta.url));

function seed() {
  const company = {
    id: COMPANY_ID, createdAt: NOW, updatedAt: NOW, name: 'Kávový e-shop s. r. o.', legalForm: 'SRO', taxpayerType: 'PO',
    ico: '12345679', vatMode: 'PAYER', accountingMode: 'NONE', onboardedAt: NOW, address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' }
  };
  const data = { schemaVersion: 1, companyId: COMPANY_ID, company, updatedAt: NOW };
  const workspace = {
    schemaVersion: 1, workspaceId: 'e2e-workspace', updatedAt: NOW, activeCompanyId: COMPANY_ID, settings: {}, keys: null,
    companies: [{ id: COMPANY_ID, name: company.name, folderId: null, updatedAt: NOW }]
  };
  return { workspace: JSON.stringify(workspace), company: JSON.stringify(data) };
}

function idb(page, action, payload = {}) {
  return page.evaluate(({ action, payload, key }) => new Promise((resolve, reject) => {
    const req = indexedDB.open('we-invoice', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('files', action === 'write' ? 'readwrite' : 'readonly');
      const store = tx.objectStore('files');
      if (action === 'write') {
        store.put(payload.workspace, 'workspace');
        store.put(payload.company, key);
        tx.oncomplete = () => { db.close(); resolve(null); };
      } else {
        const get = store.get(key);
        get.onsuccess = () => { db.close(); resolve(get.result); };
      }
      tx.onerror = () => reject(tx.error);
    };
  }), { action, payload, key: `company:${COMPANY_ID}` });
}

async function importOrders(page) {
  await page.goto('./#/exim/import');
  await page.selectOption('#exim-import-program', 'shoptet');
  await expect(page.locator('#exim-import-target')).toBeVisible();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#exim-import-choose').click()]);
  await chooser.setFiles(ORDERS);
  await expect(page.locator('#exim-import-counts')).toBeVisible();
}

test('Shoptet orders become draft invoices with customers and products', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./');
  await expect(page.locator('main#main h1')).toBeVisible();
  await idb(page, 'write', seed());
  await page.reload();
  await expect(page.locator('main#main h1')).toBeVisible();

  await importOrders(page);
  const counts = page.locator('#exim-import-counts li');
  await expect(counts.nth(3)).toContainText('3');
  await expect(page.locator('.exim-issues')).toContainText('2026000103');
  await page.locator('#exim-import-apply').click();
  await page.locator('.modal-actions .btn-primary').click();
  await expect(page.locator('.toast-success')).toBeVisible();

  const stored = JSON.parse(await idb(page, 'read'));
  const drafts = stored.documents.filter(d => d.orderReference);
  expect(drafts.map(d => [d.orderReference, d.kind, d.status, d.number])).toEqual([
    ['2026000101', 'INVOICE', 'DRAFT', null], ['2026000102', 'INVOICE', 'DRAFT', null], ['2026000104', 'INVOICE', 'DRAFT', null]
  ]);
  expect(drafts[0].totals.payable).toBe('54.12');
  expect(stored.contacts.map(c => c.name)).toContain('Kaviareň u Moniky, s. r. o.');
  const kava = stored.items.find(i => i.code === 'KAVA-1KG');
  expect(drafts[0].lines[0].itemId).toBe(kava.id);

  await importOrders(page);
  await expect(counts.nth(3)).toContainText('0');
  await expect(page.locator('#exim-import-apply')).toBeDisabled();
});
