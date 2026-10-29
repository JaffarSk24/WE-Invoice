// A received invoice from the Inbox (WP-PURCHASE) is a document like any
// other for the VAT records (WP-TAX) and the export for the accountant
// (WP-EXIM): once confirmed it is listed among the received documents of
// its month and goes out in the Pohoda XML as a received invoice.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readZip } from '../../packages/core/imports/zip.js';
import { seed, company, offline } from './support/seed.js';

const PDF = fileURLToPath(new URL('../fixtures/inbox/pdf/sk-invoice-simple.pdf', import.meta.url));

test('an Inbox invoice reaches the VAT records and the Pohoda export', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00+02:00'));
  await offline(page);
  await seed(page, { company: company() }, { hash: '#/inbox' });

  await page.locator('.inbox-drop input[type="file"][multiple]').setInputFiles(PDF);
  await expect(page).toHaveURL(/#\/inbox\/[^/]+$/, { timeout: 20_000 });
  await expect(page.locator('input[data-field="total"]')).toHaveValue('221,40');
  await page.locator('select[data-field="category"]').selectOption('SERVICES');
  await page.locator('[data-action="save"]').click();
  // Due on 15 October, before today: asked whether it is paid already.
  await expect(page.locator('.payment-lead')).toContainText('15. 10. 2026');
  await page.getByRole('button', { name: 'Ešte neuhradený' }).click();
  await expect(page).toHaveURL(/#\/received$/);

  await page.goto('./#/vat-records');
  await page.getByRole('button', { name: 'Nasledujúce obdobie' }).click();
  await expect(page.locator('.tax-period-name')).toContainText('október 2026');
  await page.locator('[role="tab"]', { hasText: 'Prijaté doklady' }).click();
  await expect(page.locator('[role="tabpanel"]:not([hidden])')).toContainText('Účtovníctvo Pro s.r.o.');
  await expect(page.locator('[role="tabpanel"]:not([hidden])')).toContainText('2026105');

  // The export places a received invoice by its tax date (30 September),
  // the VAT records by the month it was received and deducted.
  await page.goto('./#/exim/export');
  await page.selectOption('#exim-export-period', 'custom');
  await page.fill('#exim-export-from', '2026-09-01');
  await page.locator('#exim-export-from').dispatchEvent('change');
  await page.fill('#exim-export-to', '2026-10-31');
  await page.locator('#exim-export-to').dispatchEvent('change');
  const button = page.locator('#exim-export-zip');
  await expect(button).toBeEnabled();
  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  const files = await readZip(new Uint8Array(readFileSync(await download.path())));
  const pohoda = new TextDecoder().decode(files.get('pohoda.xml'));
  expect(pohoda).toContain('receivedInvoice');
  expect(pohoda).toContain('2026105');
  expect(pohoda).toContain('Účtovníctvo Pro s.r.o.');
});
