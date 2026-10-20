// Bookkeeping screens on the three viewports with the sample company: the
// cash book shows the paid sample documents, the tabs switch, the asset
// register explains itself when empty, the closing shows both statements,
// and axe finds no serious issue on them.
import { test, expect } from '@playwright/test';
import { seriousIssues, auditTimeout } from './support/axe.js';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('we-invoice-prefs', JSON.stringify({ demo: true, onboardingDone: true }));
  });
});

test('cash book, books and trips of the sample company', async ({ page, isMobile }) => {
  await page.goto('./#/cash-journal');
  const main = page.locator('main#main');
  await expect(main.locator('h1')).toHaveText('Peňažný denník');
  await expect(main.locator('.callout').first()).toContainText('Ukážka');
  const rows = isMobile ? main.locator('.card-list > :not(.vspacer)') : main.locator('table.table tbody tr.row');
  await expect(rows.first()).toBeVisible();
  await expect(main.locator('[data-action="add"]')).toBeDisabled();
  await main.locator('[role="tab"]', { hasText: 'Pohľadávky a záväzky' }).click();
  await expect(main.locator('h2', { hasText: 'Kniha pohľadávok' })).toBeVisible();
  await main.locator('[role="tab"]', { hasText: 'Kniha jázd' }).click();
  await expect(main.locator('.empty-state h2')).toHaveText('Žiadne jazdy v tomto roku');
});

test('asset register and year closing', async ({ page }) => {
  await page.goto('./#/assets');
  const main = page.locator('main#main');
  await expect(main.locator('h1')).toHaveText('Majetok');
  await expect(main.locator('.empty-state h2')).toHaveText('Zatiaľ žiadny majetok');
  await page.goto('./#/closing');
  await expect(main.locator('h1')).toHaveText('Uzávierka');
  await expect(main.locator('.ledger-statement')).toHaveCount(2);
  await expect(main.locator('.ledger-statement').first()).toContainText('Výkaz o príjmoch a výdavkoch');
});

test('no serious or critical axe issues on the bookkeeping screens', async ({ page, isMobile }) => {
  test.skip(isMobile, 'checked once on the desktop');
  const screens = ['#/cash-journal', '#/assets', '#/closing'];
  test.setTimeout(auditTimeout(screens.length));
  for (const hash of screens) {
    await page.goto(`./${hash}`);
    await expect(page.locator('main#main h1').first()).toBeVisible();
    const bad = await seriousIssues(page, hash);
    expect(bad).toEqual([]);
  }
});
