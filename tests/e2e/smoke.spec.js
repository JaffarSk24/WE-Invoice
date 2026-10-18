// The empty app opens, shows the navigation, switches language and theme.
import { test, expect } from '@playwright/test';

test('app shell opens and switches language and theme', async ({ page, isMobile }) => {
  await page.goto('./');
  await expect(page.locator('main#main h1')).toBeVisible();
  if (isMobile) {
    await expect(page.locator('.bottom-bar')).toBeVisible();
    await page.locator('.bottom-item[href="#/more"]').click();
    await expect(page.locator('main#main .nav-item').first()).toBeVisible();
    return;
  }
  await expect(page.locator('.sidebar .nav-item[href="#/invoices"]')).toHaveText('Faktúry');
  await page.selectOption('#pref-language', 'en');
  await expect(page.locator('.sidebar .nav-item[href="#/invoices"]')).toHaveText('Invoices');
  await page.selectOption('#pref-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.locator('.sidebar .nav-item[href="#/contacts"]').click();
  await expect(page.locator('main#main h1')).toHaveText('Contacts');
});
