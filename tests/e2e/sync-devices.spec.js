// Two devices of one user with Google Drive mocked (test plan § 11.3,
// scenario 8): both work on the same company, each issues an invoice and
// one adds a contact; after syncing both have everything, and the invoice
// number taken on both devices is given anew on one of them.
import { test, expect } from '@playwright/test';
import { FakeDrive, newDevice, turnOnEncryption, unlockWith, syncNow } from './support/fake-drive.js';
import { seed, company, contact, live } from './support/seed.js';
import { issueInvoice } from './support/editor.js';

test.describe.configure({ timeout: 150_000 });

const PASSWORD = 'Silne-Heslo-2026';

test('two devices merge their changes and settle a duplicate number', async ({ browser }, testInfo) => {
  const drive = new FakeDrive();
  const a = await newDevice(browser, testInfo, drive);
  await seed(a.page, { company: company(), contacts: [contact()] });
  await turnOnEncryption(a.page, PASSWORD, expect);

  const b = await newDevice(browser, testInfo, drive);
  await b.page.goto('./');
  await unlockWith(b.page, PASSWORD, expect);
  await expect(b.page.locator('#company-switcher option:checked')).toHaveText('Biela Orlica s.r.o.', { timeout: 15_000 });

  // Both devices issue the first invoice of the year: the same number.
  const numberA = await issueInvoice(a.page, { name: 'Práca zariadenie A', price: '100' });
  const numberB = await issueInvoice(b.page, { name: 'Práca zariadenie B', price: '200' });
  expect(numberB).toBe(numberA);
  await b.page.goto('./#/contacts');
  await b.page.locator('#contacts-new').click();
  await b.page.fill('#contact-name', 'Gama Servis s. r. o.');
  await b.page.locator('#contact-save').click();
  await expect(b.page.locator('#contact-title')).toHaveText('Gama Servis s. r. o.');

  await syncNow(a.page, drive, expect);
  await syncNow(b.page, drive, expect);
  await expect(b.page.locator('.toast', { hasText: 'nové číslo' })).toBeVisible();
  await syncNow(a.page, drive, expect);

  for (const device of [a, b]) {
    const docs = (await live(device.page, 'documents')).filter(d => d.kind === 'INVOICE');
    expect(docs).toHaveLength(2);
    expect(new Set(docs.map(d => d.number)).size).toBe(2);
    expect(docs.map(d => d.lines[0].name).sort()).toEqual(['Práca zariadenie A', 'Práca zariadenie B']);
    expect((await live(device.page, 'contacts')).map(c => c.name).sort()).toEqual(['Beta Obchod, s. r. o.', 'Gama Servis s. r. o.']);
  }
  const [docA] = (await live(a.page, 'documents')).filter(d => d.lines[0].name === 'Práca zariadenie A');
  expect(docA.number).toBe(numberA);

  await a.context.close();
  await b.context.close();
});
