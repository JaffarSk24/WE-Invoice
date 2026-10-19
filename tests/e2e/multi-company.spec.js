// Two companies in one workspace (test plan § 11.3, scenario 9): the
// switch (the menu on a desktop, the More screen on a phone) shows only
// the open company's contacts and documents, a record made in one never
// appears in the other, and numbering runs per company.
import { test, expect } from '@playwright/test';
import { seed, company, contact, invoice, live, offline } from './support/seed.js';
import { issueInvoice } from './support/editor.js';

test.describe.configure({ timeout: 90_000 });

const ALFA = company();
const GAMA = company({ id: 'e2e-company-2', name: 'Gama Dizajn s.r.o.', ico: '50778811', dic: '2120778811', icDph: 'SK2120778811', vatMode: 'NONPAYER', accountingMode: 'TAX_RECORDS_FLAT' });
const GAMA_CLIENT = contact({ id: 'e2e-contact-g', name: 'Delta Reklama s. r. o.', ico: '46120092' });

async function switchTo(page, isMobile, name) {
  if (isMobile) {
    await page.goto('./#/more');
    await page.locator('#more-company-switcher').selectOption({ label: name });
  } else {
    await page.locator('#company-switcher').selectOption({ label: name });
  }
  await expect(page.locator('#company-switcher option:checked')).toHaveText(name);
}

test('two companies stay apart', async ({ page, isMobile }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00+02:00'));
  await offline(page);
  await seed(page, [
    { company: ALFA, contacts: [contact()], documents: [invoice({ number: 'FA20260001' })] },
    { company: GAMA, contacts: [GAMA_CLIENT] }
  ], { hash: '#/invoices' });

  await expect(page.locator('.data-table')).toContainText('FA20260001');
  await switchTo(page, isMobile, GAMA.name);
  await page.goto('./#/invoices');
  await expect(page.locator('.table-empty, .empty-state').first()).toBeVisible();
  await page.goto('./#/contacts');
  await expect(page.locator('main#main')).toContainText('Delta Reklama s. r. o.');
  await expect(page.locator('main#main')).not.toContainText('Beta Obchod');

  // The first invoice of the second company starts its own numbering.
  const number = await issueInvoice(page, { contactId: GAMA_CLIENT.id, name: 'Logo', price: '300' });
  expect(number).toBe('FA20260001');
  expect((await live(page, 'documents', GAMA.id)).map(d => d.buyer.name)).toEqual(['Delta Reklama s. r. o.']);

  await switchTo(page, isMobile, ALFA.name);
  await page.goto('./#/invoices');
  await expect(page.locator('.data-table')).toContainText('Beta Obchod, s. r. o.');
  await expect(page.locator('.data-table')).not.toContainText('Delta Reklama');
  expect((await live(page, 'documents', ALFA.id)).map(d => d.number)).toEqual(['FA20260001']);
  await page.reload();
  await expect(page.locator('#company-switcher option:checked')).toHaveText(ALFA.name);
});
