// Steps in the document editor shared by the end-to-end tests: fill an
// item line, issue the document and read its number from the card.
import { expect } from '@playwright/test';

/** Fills a line of the editor (the first one unless index says otherwise). */
export async function fillLine(page, { name, qty, price, index = 0 }) {
  const line = page.locator('.line-item').nth(index);
  await line.getByLabel('Názov', { exact: true }).fill(name);
  await line.getByLabel('Množstvo').fill(qty);
  await line.getByLabel('Množstvo').press('Tab');
  await line.getByLabel('Cena bez DPH').first().fill(price);
  await line.getByLabel('Cena bez DPH').first().press('Tab');
}

/** Issues the open draft and returns the number shown on its card. */
export async function issue(page) {
  await page.locator('#editor-issue').click();
  await expect(page.locator('main h1')).toHaveText(/ [A-Z]{2}\d{8}$/);
  return (await page.locator('main h1').innerText()).split(' ').pop();
}

/** A new invoice for a stored contact, one line, issued; returns its number. */
export async function issueInvoice(page, { contactId = 'e2e-contact-1', name = 'Konzultácie', qty = '1', price = '100' } = {}) {
  await page.goto(`./#/invoices/new?contact=${contactId}`);
  await expect(page.locator('.party-summary strong')).toBeVisible();
  await fillLine(page, { name, qty, price });
  return issue(page);
}
