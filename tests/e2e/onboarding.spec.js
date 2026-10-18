// The "My company" wizard end to end with the gateway mocked: register
// lookup fills the form, the company lands in the store and survives a
// reload, the wizard can be left and resumed, a lookup
// failure allows manual entry, demo mode fills the dashboard. The whole
// path to "Issue the first invoice" stays well under 60 seconds.
import { test, expect } from '@playwright/test';

const LOOKUP = {
  name: 'Alfa Stavby, s. r. o.', ico: '12345679', dic: '2020000004', icDph: 'SK2020000004', legalForm: 'SRO', legalFormText: 'Spoločnosť s ručením obmedzeným',
  registerEntry: 'OR OS Bratislava I, oddiel Sro, vložka 1/B', country: 'SK',
  address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' }, source: 'RPO', checkedAt: '2026-10-18T10:00:00Z'
};

async function mockGateway(page, status = 200, body = LOOKUP) {
  await page.route('**/v1/company/sk/**', route => route.fulfill({
    status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body)
  }));
}

const next = (page) => page.locator('#ob-next').click();

test('register lookup to the first invoice in under 60 seconds', async ({ page }) => {
  const started = Date.now();
  await mockGateway(page);
  await page.goto('./');
  await page.locator('.empty-state .btn-brand').click();
  await expect(page).toHaveURL(/#\/onboarding/);
  await expect(page.locator('.sidebar')).toHaveCount(0);
  await next(page);
  await page.locator('label.radio-card', { hasText: 'Vyskúšať bez prihlásenia' }).click();
  await next(page);
  await expect(page.locator('#wizard-title')).toHaveText('Moja firma');
  await page.fill('#ob-ico', '12 345 679');
  await page.locator('#ob-lookup').click();
  await expect(page.locator('#ob-name')).toHaveValue('Alfa Stavby, s. r. o.');
  await expect(page.locator('#ob-legal-form')).toHaveValue('SRO');
  await next(page);
  await expect(page.locator('#wizard-title')).toHaveText('Režim DPH');
  await next(page);
  await expect(page.locator('label.radio-card')).toHaveCount(2);
  await next(page);
  await page.fill('#ob-iban', 'SK31 1200 0000 1987 4263 7541');
  await page.locator('#ob-iban').blur();
  await next(page);
  await next(page);
  await next(page);
  await expect(page.locator('#ob-first-invoice')).toBeVisible();
  await page.locator('#ob-first-invoice').click();
  await expect(page).toHaveURL(/#\/invoices/);
  await expect(page.locator('#company-switcher option:checked')).toHaveText('Alfa Stavby, s. r. o.');
  expect(Date.now() - started).toBeLessThan(60_000);
  // The company lives in the store (synced to Drive), not only on the device.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('we-invoice-local-company'))).toBe(null);
  await page.reload();
  await expect(page.locator('#company-switcher option:checked')).toHaveText('Alfa Stavby, s. r. o.');
});

test('the wizard can be left and resumed', async ({ page }) => {
  await page.goto('./#/onboarding');
  await next(page);
  await page.locator('label.radio-card', { hasText: 'Vyskúšať bez prihlásenia' }).click();
  await next(page);
  await page.fill('#ob-name', 'Moja živnosť');
  await page.locator('button', { hasText: 'Dokončiť neskôr' }).click();
  await expect(page).toHaveURL(/#\/dashboard/);
  await page.locator('.empty-state .btn-brand', { hasText: 'Pokračovať' }).click();
  await expect(page.locator('#wizard-title')).toHaveText('Moja firma');
});

test('a failed lookup allows manual entry', async ({ page }) => {
  await mockGateway(page, 404, { error: 'NOT_FOUND' });
  await page.goto('./#/onboarding');
  await next(page);
  await page.locator('label.radio-card', { hasText: 'Vyskúšať bez prihlásenia' }).click();
  await next(page);
  await page.fill('#ob-ico', '87654318');
  await page.locator('#ob-lookup').click();
  await expect(page.locator('#ob-lookup-status')).toContainText('nenašli');
  await next(page);
  await expect(page.locator('#ob-name')).toHaveAttribute('aria-invalid', 'true');
  await page.fill('#ob-name', 'Ručne zadaná firma');
  await next(page);
  await expect(page.locator('#wizard-title')).toHaveText('Režim DPH');
});

test('sample data fill the dashboard', async ({ page, isMobile }) => {
  await page.goto('./#/onboarding');
  await next(page);
  await page.locator('label.radio-card', { hasText: 'Ukážkové dáta' }).click();
  await next(page);
  await page.locator('#ob-go-dashboard').click();
  await expect(page).toHaveURL(/#\/dashboard/);
  await expect(page.locator('.widget[data-widget="issued"]')).toBeVisible();
  await expect(page.locator('.widget[data-widget="taxCalendar"] .calendar-row').first()).toBeVisible();
  await page.locator('.widget[data-widget="issued"] button[aria-label="Skryť widget"]').click();
  await expect(page.locator('.widget[data-widget="issued"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.widget[data-widget="issued"]')).toHaveCount(0);
  if (isMobile) {
    const inline = page.locator('main#main footer.promo-inline');
    await inline.scrollIntoViewIfNeeded();
    await expect(inline).toBeVisible();
  }
});
