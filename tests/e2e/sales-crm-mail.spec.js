// Sending an invoice by e-mail in the browser: the window is filled from
// the client card (address, language of the document), the PDF is
// downloaded, the mail program is opened with a mailto: link, and the
// sending lands in the history of the client.
import { test, expect } from '@playwright/test';
import { setUpCompany, addClient, seedInvoice } from './sales-crm-helpers.js';

test('an invoice is sent by e-mail through the mail program', async ({ page }) => {
  test.setTimeout(90_000);
  await setUpCompany(page);
  await addClient(page);
  await page.locator('#contact-edit').click();
  await page.locator('#contact-emails button', { hasText: 'Pridať e-mail' }).click();
  await page.locator('#contact-emails input[type="email"]').fill('faktury@beta.sk');
  await page.locator('#contact-save').click();
  await expect(page.locator('.contact-overview')).toContainText('faktury@beta.sk');
  const cardUrl = page.url();

  await seedInvoice(page, { number: '2026001', issueDate: '2026-10-01', dueDate: '2026-10-15', language: 'en' });
  await page.goto(cardUrl);
  await page.locator('[role="tab"]', { hasText: 'Doklady' }).click();
  await page.locator('.doc-send').first().click();

  await expect(page.locator('#mail-to')).toHaveValue('faktury@beta.sk');
  await expect(page.locator('#mail-language')).toHaveValue('en');
  await expect(page.locator('#mail-subject')).toHaveValue('Invoice No. 2026001 from Alfa Stavby, s. r. o.');
  await expect(page.locator('#mail-body')).toHaveValue(/variable symbol 2026001/);
  await page.selectOption('#mail-language', 'sk');
  await expect(page.locator('#mail-subject')).toHaveValue('Faktúra č. 2026001 od Alfa Stavby, s. r. o.');

  const download = page.waitForEvent('download');
  await page.locator('#mail-send').click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  const link = page.locator('#mail-open-link');
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href.startsWith('mailto:faktury%40beta.sk?')).toBe(true);
  expect(decodeURIComponent(href)).toContain('subject=Faktúra č. 2026001');

  await page.keyboard.press('Escape');
  await page.locator('[role="tab"]', { hasText: 'História e-mailov' }).click();
  await expect(page.locator('.tab-panel:not([hidden])')).toContainText('otvorené v e-mailovom programe');
  await page.locator('[role="tab"]', { hasText: 'Doklady' }).click();
  await expect(page.locator('.tab-panel:not([hidden]) .status-badge').first()).toHaveAttribute('data-status', 'SENT');
});
