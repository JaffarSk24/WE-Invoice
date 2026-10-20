// The first minute of a new user (test plan § 11.3, scenario 1, and matrix
// row A26), shared by the scenario on every viewport (first-run.spec.js)
// and by its time budget, measured alone in the timing project
// (first-run.timing.spec.js): the sample data first, then the "My company"
// wizard with the register lookup mocked, the first invoice for a new
// client and its PDF. Returns the number and the milliseconds it took.
import { expect } from '@playwright/test';
import { offline, json } from './seed.js';
import { fillLine, issue } from './editor.js';
import { COMPANY } from '../sales-crm-helpers.js';

export async function firstRun(page) {
  await offline(page);
  await page.route('**/v1/company/sk/**', route => json(route, COMPANY));
  const started = Date.now();
  const next = () => page.locator('#ob-next').click();

  await page.goto('./');
  await page.locator('.empty-state .btn-brand').click();
  await next();
  await page.locator('label.radio-card', { hasText: 'Ukážkové dáta' }).click();
  await next();
  await page.locator('#ob-go-dashboard').click();
  await expect(page.locator('.widget[data-widget="issued"]')).toBeVisible();

  // Enough of the sample: leave it and set up the own company.
  await page.goto('./#/settings/interface');
  await page.locator('#settings-demo').click();
  await page.locator('.modal-content .modal-actions .btn-primary').click();
  await page.goto('./#/onboarding');
  await next();
  await page.locator('label.radio-card', { hasText: 'Vyskúšať bez prihlásenia' }).click();
  await next();
  await page.fill('#ob-ico', COMPANY.ico);
  await page.locator('#ob-lookup').click();
  await expect(page.locator('#ob-name')).toHaveValue(COMPANY.name);
  await next();
  await next();
  await next();
  await page.fill('#ob-iban', 'SK31 1200 0000 1987 4263 7541');
  await page.locator('#ob-iban').blur();
  await next();
  await next();
  await next();
  await page.locator('#ob-first-invoice').click();
  await expect(page).toHaveURL(/#\/invoices\/new/);

  await page.locator('#editor-new-contact').click();
  const modal = page.locator('.modal-content');
  await modal.getByLabel('Názov alebo meno').fill('Prvý klient s. r. o.');
  await modal.getByLabel('Ulica a číslo').fill('Dlhá 5');
  await modal.getByLabel('Mesto').fill('Košice');
  await modal.getByLabel('PSČ').fill('040 01');
  await modal.getByRole('button', { name: 'Vytvoriť a použiť' }).click();
  await expect(page.locator('.party-summary strong')).toHaveText('Prvý klient s. r. o.');
  await fillLine(page, { name: 'Konzultácie', qty: '2', price: '60' });
  const number = await issue(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#detail-pdf').click()]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect(number).toMatch(/^FA2026/);
  return { number, ms: Date.now() - started };

}
