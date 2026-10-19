// A recurring invoice makes its draft on the right local day: the clock is
// set to the day before the first run (nothing happens), then to the day
// itself, and the draft appears once, also after another reload.
import { test, expect } from '@playwright/test';
import { setUpCompany, addClient, firstRow, CLIENT } from './sales-crm-helpers.js';

test('a recurring invoice makes a draft on its day, once', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-10-04T10:00:00+02:00'));
  await setUpCompany(page);
  await addClient(page);

  await page.goto('./#/recurring');
  await page.locator('#recurring-new').click();
  await page.selectOption('#tpl-contact', { label: CLIENT.name });
  await page.locator('#tpl-lines .tpl-line-name').fill('Hosting {period}');
  await page.locator('#tpl-lines .tpl-line-price').fill('20');
  await page.fill('#tpl-first-run', '2026-10-05');
  await page.locator('#tpl-first-run').dispatchEvent('change');
  await expect(page.locator('#tpl-preview')).toContainText('5. 10. 2026');
  await page.locator('#tpl-save').click();
  await expect(page.locator('.data-table')).toContainText(CLIENT.name);
  await expect(page.locator('.data-table')).toContainText('5. 10. 2026');

  await page.reload();
  await page.waitForTimeout(3500);
  await firstRow(page).click();
  await expect(page.locator('.tpl-history-card')).toContainText('Zatiaľ sa nevytvoril žiadny doklad.');

  await page.clock.setFixedTime(new Date('2026-10-05T00:30:00+02:00'));
  await page.reload();
  await expect(page.locator('.toast', { hasText: 'Vytvorené pravidelné faktúry: 1.' })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.tpl-history li')).toHaveCount(1);

  await page.goto('./#/recurring');
  await expect(page.locator('.data-table')).toContainText('5. 11. 2026');
  await page.reload();
  await page.waitForTimeout(3500);
  await firstRow(page).click();
  await expect(page.locator('.tpl-history li')).toHaveCount(1);
  await expect(page.locator('.tpl-history')).toContainText('1. 10. 2026');
});
