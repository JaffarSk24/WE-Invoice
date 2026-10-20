// Purchase end to end: a PDF invoice dropped into the Inbox is read (text
// layer and PAY by square QR), reviewed with one value picked from the
// preview ("Vybrať"), confirmed and listed among received invoices; a
// PDF with an embedded Factur-X XML needs no confirmation notice.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';

const pdf = (name) => fileURLToPath(new URL(`../fixtures/inbox/pdf/${name}.pdf`, import.meta.url));
const NOW = '2026-10-18T08:00:00.000Z';
const COMPANY = {
  id: 'e2e-company', createdAt: NOW, updatedAt: NOW, name: 'Biela Orlica s.r.o.', legalForm: 'SRO', taxpayerType: 'PO',
  ico: '36123455', dic: '2020123402', icDph: 'SK2020123402', vatMode: 'PAYER', vatPeriod: 'MONTH',
  address: { street: 'Hlavná 1', city: 'Bratislava', zip: '81101', country: 'SK' },
  bankAccounts: [{ id: 'acc1', name: 'Účet', iban: 'SK2411000000002612345678', currency: 'EUR', isDefault: true }]
};

// A workspace with one company, written where the store reads it.
async function seedCompany(page, theme = 'light') {
  await page.goto('./');
  // Wait until the app has started: its first run writes an empty workspace.
  await expect(page.locator('main h1').first()).toBeVisible();
  await page.evaluate(async ({ company, now, theme }) => {
    localStorage.setItem('we-invoice-prefs', JSON.stringify({ onboardingDone: true, language: 'sk', theme }));
    const collections = ['contacts', 'items', 'priceLevels', 'documents', 'recurringTemplates', 'bankTransactions', 'cashBooks', 'warehouses',
      'stockMoves', 'ledgerEntries', 'assets', 'trips', 'reminderPolicies', 'emailTemplates', 'auditLog'];
    const data = { schemaVersion: 1, companyId: company.id, updatedAt: now, company };
    collections.forEach(c => { data[c] = []; });
    const workspace = { schemaVersion: 1, workspaceId: 'e2e-ws', updatedAt: now, companies: [{ id: company.id, name: company.name, folderId: null, updatedAt: now }], activeCompanyId: company.id, keys: null, settings: {}, betaToken: null };
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('we-invoice', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put(JSON.stringify(workspace), 'workspace');
      tx.objectStore('files').put(JSON.stringify(data), `company:${company.id}`);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { company: COMPANY, now: NOW, theme });
  // A hash change alone keeps the page: reload so the store reads the seed.
  await page.goto('./#/inbox');
  await page.reload();
  await expect(page.locator('#company-switcher option:checked')).toHaveText(COMPANY.name);
}

test('a PDF invoice goes from the Inbox to received invoices', async ({ page }) => {
  await seedCompany(page);
  await page.goto('./#/inbox');
  await expect(page.locator('main h1')).toHaveText('Inbox');
  await page.locator('.inbox-drop input[type="file"][multiple]').setInputFiles(pdf('sk-invoice-simple'));
  await expect(page).toHaveURL(/#\/inbox\/[^/]+$/, { timeout: 20_000 });
  await expect(page.locator('main h1')).toContainText('2026105');
  await expect(page.locator('.review-notice')).toBeVisible();
  await expect(page.locator('input[data-field="ico"]')).toHaveValue('51234564');
  await expect(page.locator('input[data-field="iban"]')).toHaveValue('SK9156000000001234567890');
  await expect(page.locator('input[data-field="total"]')).toHaveValue('221,40');
  await expect(page.locator('.field[data-field="iban"] .field-source')).toHaveText('Z QR kódu');

  // "Vybrať": the variable symbol is cleared, then picked from the preview.
  await page.locator('input[data-field="vs"]').fill('');
  await expect(page.locator('.review-preview')).toHaveAttribute('data-ready', '1');
  await page.locator('[data-pick="vs"]').click();
  await expect(page.locator('.pick-banner')).toBeVisible();
  await page.locator('.pick-box[aria-label*="Variabilný symbol"]').first().click();
  await expect(page.locator('input[data-field="vs"]')).toHaveValue('2026105');

  await page.locator('select[data-field="category"]').selectOption('SERVICES');
  await page.locator('[data-action="save"]').click();
  await expect(page).toHaveURL(/#\/received$/);
  await page.locator('.filter-preset').selectOption('all');
  await expect(page.locator('.data-table')).toContainText('Účtovníctvo Pro s.r.o.');
  await expect(page.locator('.data-table')).toContainText('221,40');

  // The Inbox is empty again.
  await page.goto('./#/inbox');
  await expect(page.locator('.table-empty')).toBeVisible();
});

test('an embedded Factur-X XML is trusted without a notice', async ({ page }) => {
  await seedCompany(page);
  await page.goto('./#/inbox');
  await page.locator('.inbox-drop input[type="file"][multiple]').setInputFiles(pdf('de-invoice-zugferd'));
  await expect(page).toHaveURL(/#\/inbox\/[^/]+$/, { timeout: 20_000 });
  await expect(page.locator('main h1')).toContainText('RE-2026-55012');
  await expect(page.locator('.review-notice')).toHaveCount(0);
  await expect(page.locator('input[data-field="total"]')).toHaveValue('428,40');
  await expect(page.locator('.field[data-field="total"] .field-source')).toHaveText('Z eFaktúry (XML)');
});

test('a photo of a receipt is read by OCR on the device', async ({ page }) => {
  test.setTimeout(120_000);
  await seedCompany(page);
  await page.goto('./#/inbox');
  const scan = fileURLToPath(new URL('../fixtures/inbox/scans/sk-receipt-shop.jpg', import.meta.url));
  await page.locator('.inbox-drop input[type="file"][multiple]').setInputFiles(scan);
  await expect(page).toHaveURL(/#\/inbox\/[^/]+$/, { timeout: 90_000 });
  await expect(page.locator('select[data-field="kind"]')).toHaveValue('EXPENSE_RECEIPT');
  await expect(page.locator('input[data-field="ico"]')).toHaveValue('50778811');
  await expect(page.locator('input[data-field="supplierName"]')).toHaveValue('PAPIERNICTVO U SOVY');
  await expect(page.locator('input[data-field="total"]')).toHaveValue('15,40');
  await expect(page.locator('.field[data-field="total"] .field-source')).toHaveText('Rozpoznané z obrázka');
  // A receipt needs the payment method chosen by hand.
  await page.locator('[data-action="save"]').click();
  await expect(page.locator('select[data-field="paymentMethod"]')).toHaveAttribute('aria-invalid', 'true');
  await page.locator('select[data-field="paymentMethod"]').selectOption('CASH');
  await page.locator('[data-action="save"]').click();
  await expect(page).toHaveURL(/#\/expenses$/);
});

for (const theme of ['light', 'dark']) test(`the purchase screens have no serious accessibility issues (${theme})`, async ({ page }) => {
  await seedCompany(page, theme);
  const axe = async (name) => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    return result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${name} ${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')}`);
  };
  const bad = [...await axe('inbox')];
  await page.locator('.inbox-drop input[type="file"][multiple]').setInputFiles(pdf('sk-invoice-multirate'));
  await expect(page).toHaveURL(/#\/inbox\/[^/]+$/, { timeout: 20_000 });
  await expect(page.locator('.review-preview')).toHaveAttribute('data-ready', '1');
  bad.push(...await axe('review'));
  await page.goto('./#/expenses');
  await expect(page.locator('main h1')).toHaveText('Výdavky a bločky');
  bad.push(...await axe('expenses'));
  expect(bad).toEqual([]);
});
