// The first minute (test plan § 11.3, scenario 1) on every viewport: the
// sample data, the "My company" wizard, the first invoice for a new client
// and its PDF (support/first-run.js). The 60 second budget of the same
// path is measured alone in first-run.timing.spec.js.
import { test, expect } from '@playwright/test';
import { firstRun } from './support/first-run.js';
import { COMPANY } from './sales-crm-helpers.js';

test('first run: sample data, the wizard, the first invoice and its PDF', async ({ page }) => {
  test.setTimeout(120_000);
  const { number } = await firstRun(page);
  expect(number).toMatch(/^FA2026/);

  // The sample data are gone; only the real company is left.
  await page.goto('./#/invoices');
  await expect(page.locator('.data-table')).toContainText('Prvý klient s. r. o.');
  await expect(page.locator('#company-switcher option:checked')).toHaveText(COMPANY.name);
});
