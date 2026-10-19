// A receipt with the QR code of an online eKasa receipt (test plan
// § 11.3, scenario 14): the Inbox reads the receipt id from the QR code,
// asks the gateway (mocked) for the data of the Financial Administration,
// and the fields come from eKasa; confirmed, it is an expense receipt.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seed, company, json, live, offline } from './support/seed.js';

const PDF = fileURLToPath(new URL('../fixtures/inbox/pdf/sk-receipt-ekasa.pdf', import.meta.url));
const RECEIPT = JSON.parse(readFileSync(new URL('../fixtures/inbox/qr/ekasa-receipt.json', import.meta.url), 'utf8'));

test('an eKasa QR code fills the receipt from the eKasa data', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00+02:00'));
  await offline(page);
  const asked = [];
  await page.route('**/v1/ekasa/receipt', route => {
    if (route.request().method() === 'POST') asked.push(JSON.parse(route.request().postData()).receiptId);
    return json(route, RECEIPT);
  });
  await seed(page, { company: company() }, { hash: '#/inbox' });

  await page.locator('.inbox-drop input[type="file"][multiple]').setInputFiles(PDF);
  await expect(page).toHaveURL(/#\/inbox\/[^/]+$/, { timeout: 30_000 });
  expect(asked).toEqual([RECEIPT.receiptId]);
  await expect(page.locator('select[data-field="kind"]')).toHaveValue('EXPENSE_RECEIPT');
  await expect(page.locator('input[data-field="ico"]')).toHaveValue('36987123');
  await expect(page.locator('input[data-field="total"]')).toHaveValue('81,93');
  await expect(page.locator('.field[data-field="total"] .field-source')).toHaveText('Z eKasy');

  // A long receipt id in the title wraps instead of widening the page.
  const width = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(width[0]).toBeLessThanOrEqual(width[1]);
  await page.locator('select[data-field="paymentMethod"]').selectOption('CARD');
  await page.locator('[data-action="save"]').click();
  await expect(page).toHaveURL(/#\/expenses$/);
  const receipt = (await live(page, 'documents')).find(d => d.kind === 'EXPENSE_RECEIPT');
  expect(receipt).toMatchObject({ number: RECEIPT.receiptId });
  expect(receipt.totals.payable).toBe('81.93');
});
