// The main sales path end to end on the three viewports: a company from
// the wizard (register lookup mocked), an invoice for a new client created
// on the spot, its PDF, a payment and a credit note; then a proforma paid
// in full and the final invoice that deducts the advance.
import { test, expect } from '@playwright/test';

// The wizard alone takes about 20 seconds on the emulated phones, so the
// whole path gets more than the default 30 seconds.
test.describe.configure({ timeout: 90_000 });

const LOOKUP = {
  name: 'Alfa Stavby, s. r. o.', ico: '12345679', dic: '2020000004', icDph: 'SK2020000004', legalForm: 'SRO', legalFormText: 'Spoločnosť s ručením obmedzeným',
  registerEntry: 'OR OS Bratislava I, oddiel Sro, vložka 1/B', country: 'SK',
  address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' }, source: 'RPO', checkedAt: '2026-10-18T10:00:00Z'
};

async function companyFromWizard(page) {
  await page.route('**/v1/company/sk/**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(LOOKUP)
  }));
  await page.goto('./#/onboarding');
  const next = () => page.locator('#ob-next').click();
  await next();
  await page.locator('label.radio-card', { hasText: 'Vyskúšať bez prihlásenia' }).click();
  await next();
  await page.fill('#ob-ico', '12345679');
  await page.locator('#ob-lookup').click();
  await expect(page.locator('#ob-name')).toHaveValue(LOOKUP.name);
  await next();
  await next();
  await next();
  await page.fill('#ob-iban', 'SK31 1200 0000 1987 4263 7541');
  await page.locator('#ob-iban').blur();
  await next();
  await next();
  await next();
  await page.locator('#ob-first-invoice').click();
  await expect(page).toHaveURL(/#\/invoices\/new/);
}

async function newClient(page, name) {
  await page.locator('#editor-new-contact').click();
  const modal = page.locator('.modal-content');
  await modal.getByLabel('Názov alebo meno').fill(name);
  await modal.getByLabel('IČO').fill('35757442');
  await modal.getByLabel('DIČ').fill('2021234567');
  await modal.getByLabel('Ulica a číslo').fill('Dlhá 5');
  await modal.getByLabel('Mesto').fill('Košice');
  await modal.getByLabel('PSČ').fill('040 01');
  await modal.getByRole('button', { name: 'Vytvoriť a použiť' }).click();
  await expect(page.locator('.party-summary strong')).toHaveText(name);
}

async function fillLine(page, { name, qty, price }) {
  const line = page.locator('.line-item').first();
  await line.getByLabel('Názov', { exact: true }).fill(name);
  await line.getByLabel('Množstvo').fill(qty);
  await line.getByLabel('Množstvo').press('Tab');
  await line.getByLabel('Cena bez DPH').first().fill(price);
  await line.getByLabel('Cena bez DPH').first().press('Tab');
}

async function moreAction(page, selector) {
  await page.locator('.more-actions > summary').click();
  await page.locator(selector).click();
}

test('invoice for a new client: issue, PDF, payment, credit note', async ({ page }) => {
  await companyFromWizard(page);
  await newClient(page, 'Beta Obchod, a. s.');
  await fillLine(page, { name: 'Konzultácie', qty: '10', price: '50' });
  await expect(page.locator('.totals-payable')).toContainText('615,00');

  await page.locator('#editor-issue').click();
  await expect(page).toHaveURL(/#\/invoices\/[^/]+$/);
  await expect(page.locator('main h1')).toHaveText(/Faktúra FA\d{8}/);
  await expect(page.locator('.status-badge').first()).toHaveText('Vystavená');

  const download = page.waitForEvent('download');
  await page.locator('#detail-pdf').click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);

  await page.locator('#detail-add-payment').click();
  await expect(page.locator('#payment-amount')).toHaveValue('615');
  await page.locator('.modal-content').getByRole('button', { name: 'Zaznamenať úhradu' }).click();
  await expect(page.locator('.status-badge').first()).toHaveText('Uhradená');
  await expect(page.locator('.payment-due')).toHaveText('Doklad je uhradený.');

  await moreAction(page, '[data-convert="CREDIT_NOTE"]');
  await page.locator('#ask-text').fill('Zľava za oneskorenie');
  await page.locator('.modal-content').getByRole('button', { name: 'Vytvoriť' }).click();
  await expect(page).toHaveURL(/#\/credit-notes\/[^/]+\/edit/);
  await page.locator('#editor-issue').click();
  await expect(page.locator('main h1')).toHaveText(/Dobropis DB\d{8}/);
  await expect(page.locator('.detail-links')).toContainText('Faktúra FA');

  await page.goto('./#/invoices');
  await expect(page.locator('.data-table')).toContainText('Beta Obchod, a. s.');
});

test('proforma paid in full, then the final invoice deducts the advance', async ({ page }) => {
  await companyFromWizard(page);
  await page.goto('./#/proformas/new');
  await newClient(page, 'Gama, s. r. o.');
  await fillLine(page, { name: 'Záloha na dielo', qty: '1', price: '1000' });
  await page.locator('#editor-issue').click();
  await expect(page.locator('main h1')).toHaveText(/Zálohová faktúra ZF\d{8}/);

  await page.locator('#detail-add-payment').click();
  await page.locator('.modal-content').getByRole('button', { name: 'Zaznamenať úhradu' }).click();
  await expect(page.locator('.status-badge').first()).toHaveText('Uhradená');

  await moreAction(page, '[data-convert="INVOICE"]');
  await expect(page).toHaveURL(/#\/invoices\/[^/]+\/edit/);
  await expect(page.locator('.editor-advances')).toContainText('ZF');
  await expect(page.locator('.totals-payable')).toContainText('0,00');
  await page.locator('#editor-issue').click();
  await expect(page.locator('main h1')).toHaveText(/Faktúra FA\d{8}/);
  await expect(page.locator('.detail-links')).toContainText('Zálohová faktúra ZF');
});

test('the PDF preview shows inside the app, in the editor and on the card', async ({ page, isMobile }) => {
  const blocked = [];
  page.on('console', m => { if (/Refused to frame/i.test(m.text())) blocked.push(m.text()); });
  await companyFromWizard(page);
  await newClient(page, 'Delta, s. r. o.');
  await fillLine(page, { name: 'Servis', qty: '1', price: '80' });
  if (isMobile) await page.locator('.editor-preview-toggle').click();
  const frame = page.locator('.editor-preview iframe.pdf-frame');
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute('src', /^blob:/);
  await expect(page.locator('#editor-open-preview')).toHaveCount(0);
  if (isMobile) await page.locator('.editor-preview-toggle').click();

  await page.locator('#editor-issue').click();
  await expect(page.locator('main h1')).toHaveText(/Faktúra FA\d{8}/);
  await expect(page.locator('.detail-pdf iframe.pdf-frame')).toHaveAttribute('src', /^blob:/);
  expect(blocked).toEqual([]);
});
