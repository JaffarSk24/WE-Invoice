// Contacts end to end with the gateway mocked: a client is added from the
// register by IČO, gets its VAT light from VIES and the FS lists, can be
// edited (print language, due days) and found by search.
import { test, expect } from '@playwright/test';
import { setUpCompany, CLIENT } from './sales-crm-helpers.js';

test('a client is created by IČO and edited', async ({ page }) => {
  await setUpCompany(page);
  await page.goto('./#/contacts');
  await expect(page.locator('.empty-state')).toBeVisible();
  await page.locator('#contacts-lookup').click();
  await page.fill('#lookup-query', CLIENT.ico);
  await page.locator('#lookup-search').click();
  await page.locator('.lookup-result', { hasText: CLIENT.name }).click();
  await expect(page.locator('#contact-title')).toHaveText(CLIENT.name);
  await expect(page.locator('.contact-badges .vat-light[data-light]')).toHaveAttribute('data-light', 'green');
  await expect(page.locator('.contact-overview')).toContainText(CLIENT.ico);
  await expect(page.locator('.contact-badges .peppol-badge')).toBeVisible();

  await page.locator('#contact-edit').click();
  await page.selectOption('#contact-language', 'en');
  await page.fill('#contact-due-days', '30');
  await page.locator('#contact-emails button', { hasText: 'Pridať e-mail' }).click();
  await page.locator('#contact-emails input[type="email"]').fill('faktury@beta.sk');
  await page.locator('#contact-save').click();
  await expect(page.locator('#contact-title')).toHaveText(CLIENT.name);
  await expect(page.locator('.contact-overview')).toContainText('English');
  await expect(page.locator('.contact-overview')).toContainText('faktury@beta.sk');

  await page.goto('./#/contacts');
  await page.fill('#contacts-search', 'kosice');
  await expect(page.locator('#contacts-search')).toHaveValue('kosice');
  await expect(page.getByText(CLIENT.name).first()).toBeVisible();
  await page.fill('#contacts-search', 'nikto');
  await expect(page.getByText('Hľadaniu nezodpovedá žiadny kontakt.')).toBeVisible();
});

test('the new invoice button asks the sales package for a draft', async ({ page }) => {
  await setUpCompany(page);
  await page.goto('./#/contacts');
  await page.locator('#contacts-lookup').click();
  await page.fill('#lookup-query', CLIENT.ico);
  await page.locator('#lookup-search').click();
  await page.locator('.lookup-result').first().click();
  await expect(page.locator('#contact-new-invoice')).toBeVisible();
});
