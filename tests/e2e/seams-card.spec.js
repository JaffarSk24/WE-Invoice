// The card of an issued invoice talks to other packages by events: the
// e-mail window (document:send, WP-CRM), the e-invoice sending
// (peppol:send, WP-PEPPOL), a recurring invoice made from it
// (recurring:from-document, WP-CRM). Closing its VAT period on the VAT
// records screen (WP-TAX) stops the editor (WP-SALES) until the period is
// opened again.
import { test, expect } from '@playwright/test';
import { seed, company, contact, invoice, offline } from './support/seed.js';
import { cardSettled } from './support/card.js';

const SEPTEMBER = invoice({ number: 'FA20260009', issueDate: '2026-09-10', taxDate: '2026-09-10', dueDate: '2026-09-24' });
const CARD = `#/invoices/${SEPTEMBER.id}`;

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-05T10:00:00+02:00'));
  await offline(page);
  await seed(page, { company: company(), contacts: [contact()], documents: [SEPTEMBER] }, { hash: CARD });
  await expect(page.locator('main h1')).toHaveText('Faktúra FA20260009');
  await cardSettled(page, 'FA20260009');
});

async function more(page, selector) {
  await page.locator('.more-actions > summary').click();
  await page.locator(selector).click();
}

test('a closed VAT period keeps its invoice out of the editor', async ({ page }) => {
  // A long scenario: the period is closed and opened again, and the card
  // opens three times; the default 30 seconds also cover the seeding.
  test.setTimeout(60_000);
  await page.goto('./#/vat-records');
  await expect(page.locator('.tax-period-name')).toContainText('september 2026');
  await expect(page.locator('main#main')).toContainText('FA20260009');
  await page.getByRole('button', { name: 'Uzavrieť obdobie' }).click();
  await page.locator('.modal-content').getByRole('button', { name: 'Uzavrieť obdobie' }).click();
  await expect(page.locator('main#main')).toContainText('Obdobie je uzavreté');

  await page.goto(`./${CARD}`);
  await cardSettled(page, 'FA20260009');
  await page.locator('#detail-edit').click();
  await expect(page.locator('.toast', { hasText: 'Doklad patrí do uzavretého obdobia.' })).toBeVisible();
  await expect(page.locator('#editor-save')).toHaveCount(0);
  // The edit address shows the card too.
  await page.goto(`./${CARD}/edit`);
  await expect(page.locator('main h1')).toHaveText('Faktúra FA20260009');
  await expect(page.locator('#editor-save')).toHaveCount(0);

  // Opened again (with a reason), the invoice can be edited.
  await page.goto('./#/vat-records');
  await page.getByRole('button', { name: 'Otvoriť obdobie' }).click();
  await page.locator('.modal-content textarea').fill('Oprava adresy odberateľa');
  await page.locator('.modal-content').getByRole('button', { name: 'Otvoriť obdobie' }).click();
  await expect(page.locator('main#main')).toContainText('Obdobie je otvorené');
  await page.goto(`./${CARD}`);
  await cardSettled(page, 'FA20260009');
  await page.locator('#detail-edit').click();
  await page.locator('.modal-content').getByRole('button', { name: /Pokračovať|Áno|OK/ }).click();
  await expect(page.locator('#editor-save')).toBeVisible();
});

test('the card opens the e-mail window with the client address', async ({ page }) => {
  await page.locator('#detail-send').click();
  await expect(page.locator('#mail-to')).toHaveValue('uctaren@beta.example');
  await expect(page.locator('#mail-subject')).toHaveValue(/FA20260009/);
});

test('the card sends an e-invoice and says why it cannot without a provider', async ({ page }) => {
  await more(page, '#detail-peppol');
  await expect(page.locator('.toast-error, .toast', { hasText: /poskytovate|eFaktúr/i }).first()).toBeVisible();
});

test('the card starts a recurring invoice from the document', async ({ page }) => {
  await more(page, '#detail-recurring');
  await expect(page).toHaveURL(/#\/recurring\/new\?from=/);
  await expect(page.locator('#tpl-contact option:checked')).toHaveText('Beta Obchod, s. r. o.');
  await expect(page.locator('#tpl-lines .tpl-line-name').first()).toHaveValue('Konzultácie');
});
