// The phone path (test plan § 11.3, scenario 10): from the FAB a quick
// invoice for a known client, issued, sent through the mail program of
// the phone and paid, with nothing hidden under the bottom bar.
import { test, expect } from '@playwright/test';
import { seed, company, contact, offline } from './support/seed.js';
import { fillLine, issue } from './support/editor.js';

test('a quick invoice from the FAB: issue, send, record the payment', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'the FAB is on phones');
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00+02:00'));
  await offline(page);
  await seed(page, { company: company(), contacts: [contact()] });

  await page.locator('.bottom-bar .fab').click();
  await page.locator('#fab-menu [data-action="invoice"]').click();
  await expect(page).toHaveURL(/#\/invoices/);
  // The FAB opens a new invoice: pick the client from the list.
  await expect(page.locator('#editor-issue')).toBeVisible();
  const party = page.locator('#editor-contact');
  await party.fill('Beta');
  await page.locator('.editor-party .ac-item').first().click();
  await expect(page.locator('.party-summary strong')).toHaveText('Beta Obchod, s. r. o.');
  await fillLine(page, { name: 'Oprava', qty: '1', price: '80' });
  await expect(page.locator('.totals-payable')).toContainText('98,40');
  const number = await issue(page);

  await page.locator('#detail-send').click();
  await expect(page.locator('#mail-to')).toHaveValue('uctaren@beta.example');
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#mail-send').click()]);
  expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  await expect(page.locator('#mail-open-link')).toBeVisible();
  await page.keyboard.press('Escape');

  const pay = page.locator('#detail-add-payment');
  await pay.scrollIntoViewIfNeeded();
  // The button is not covered by the bottom bar.
  const bar = await page.locator('.bottom-bar').boundingBox();
  const box = await pay.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1);
  await pay.click();
  await expect(page.locator('#payment-amount')).toHaveValue('98,4');
  await page.locator('.modal-content').getByRole('button', { name: 'Zaznamenať úhradu' }).click();
  await expect(page.locator('.status-badge').first()).toHaveText('Uhradená');
  await expect(page.locator('main h1')).toContainText(number);
});
