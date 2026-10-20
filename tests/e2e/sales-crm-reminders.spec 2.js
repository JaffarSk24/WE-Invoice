// A payment reminder for an overdue invoice: the reminders screen lists
// the first reminder for today, the e-mail window carries the reminder
// template with the late interest, and the sending is logged so the same
// level is not offered again.
import { test, expect } from '@playwright/test';
import { setUpCompany, addClient, seedInvoice } from './sales-crm-helpers.js';

test('an overdue invoice gets its reminder once', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+02:00'));
  await setUpCompany(page);
  await addClient(page);
  await page.locator('#contact-edit').click();
  await page.locator('#contact-emails button', { hasText: 'Pridať e-mail' }).click();
  await page.locator('#contact-emails input[type="email"]').fill('uctaren@beta.sk');
  await page.locator('#contact-save').click();
  await expect(page.locator('.contact-overview')).toContainText('uctaren@beta.sk');

  await page.goto('./#/settings/reminders');
  await page.fill('#reminders-ecb-rate', '2,15');
  await page.locator('#reminders-save').click();
  await expect(page.locator('.toast', { hasText: 'Nastavenie upomienok je uložené.' })).toBeVisible();

  await seedInvoice(page, { number: '2026007', issueDate: '2026-09-25', dueDate: '2026-10-09' });
  await page.goto('./#/reminders');
  const row = page.locator('#reminders-today .reminder-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('1. upomienka');
  await expect(row).toContainText('2026007');
  await row.locator('.reminder-send').click();

  await expect(page.locator('#mail-to')).toHaveValue('uctaren@beta.sk');
  await expect(page.locator('#mail-subject')).toHaveValue('Upomienka: faktúra č. 2026007 je po splatnosti');
  await expect(page.locator('#mail-body')).toHaveValue(/Úrok z omeškania k 20\. 10\. 2026/);
  const download = page.waitForEvent('download');
  await page.locator('#mail-send').click();
  await download;
  await expect(page.locator('#mail-open-link')).toBeVisible();
  await page.keyboard.press('Escape');

  await expect(page.locator('#reminders-today .reminder-row')).toHaveCount(0);
  await expect(page.locator('#reminder-log')).toContainText('1. upomienka');
  await expect(page.locator('.reminder-group h2', { hasText: 'Beta Obchod' })).toBeVisible();
});
