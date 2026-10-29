// The attachments of an invoice in its e-invoice (BT-125), end to end with
// a SAPI-SK provider and Google Drive mocked: files Peppol accepts are
// embedded next to the PDF, the send window names the ones left out, and a
// file that is not on this device stops the sending with its name.
import { test, expect } from '@playwright/test';
import { FakeDrive, newDevice, turnOnEncryption } from './support/fake-drive.js';
import { routePeppol } from './support/peppol-provider.js';
import { seed, company, contact, invoice } from './support/seed.js';

test.describe.configure({ timeout: 150_000 });

const US = company({ name: 'Gama Obchod a.s.', dic: '2020000026', icDph: 'SK2020000026' });
const withFiles = invoice({ number: 'FA20260011' });
const elsewhere = invoice({ number: 'FA20260012', attachments: [{ id: 'not-here-1', name: 'protokol-z-ineho-pc.pdf', mime: 'application/pdf', size: 1200 }] });

test('attachments go into the e-invoice, the window names what Peppol does not take', async ({ browser }, testInfo) => {
  const drive = new FakeDrive();
  const a = await newDevice(browser, testInfo, drive);
  const provider = await routePeppol(a.context, { clientId: 'client-e2e', clientSecret: 'vpt_e2e' });
  await seed(a.page, { company: US, contacts: [contact()], documents: [withFiles, elsewhere] });
  await turnOnEncryption(a.page, 'Silne-Heslo-2026', expect);

  await a.page.goto('./#/settings/peppol');
  await a.page.fill('#peppol-cred-clientId', 'client-e2e');
  await a.page.fill('#peppol-cred-clientSecret', 'vpt_e2e');
  await a.page.locator('[data-action="test-connection"]').click();
  await expect(a.page.locator('.toast', { hasText: 'Pripojenie je uložené.' })).toBeVisible({ timeout: 15_000 });

  const send = async (doc) => {
    await a.page.goto(`./#/invoices/${doc.id}`);
    await expect(async () => {
      if (!(await a.page.locator('#detail-peppol').isVisible())) await a.page.locator('.more-actions > summary').click();
      await a.page.locator('#detail-peppol').click({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
  };

  await a.page.goto(`./#/invoices/${withFiles.id}`);
  await a.page.locator(`#attach-${withFiles.id}`).setInputFiles([
    { name: 'dodaci-protokol.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') },
    { name: 'zmluva.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK\u0003\u0004') }
  ]);
  await expect(a.page.locator('.doc-attachments .attachment-name')).toHaveText(['dodaci-protokol.pdf', 'zmluva.docx']);

  // The window names the file left out; cancelling sends nothing.
  await send(withFiles);
  const dialog = a.page.locator('.modal-content');
  await expect(dialog.locator('.peppol-skipped li')).toHaveText(['zmluva.docx']);
  await dialog.getByRole('button', { name: 'Zrušiť' }).click();
  await expect(dialog).toHaveCount(0);
  expect(provider.sent).toHaveLength(0);

  await send(withFiles);
  await a.page.locator('.modal-content').getByRole('button', { name: 'Odoslať bez nich' }).click();
  await expect(a.page.locator('.toast', { hasText: 'eFaktúra FA20260011 je odoslaná.' })).toBeVisible({ timeout: 20_000 });
  expect(provider.sent).toHaveLength(1);
  const xml = provider.sent[0].body.payload;
  expect(xml).toContain('<cbc:ID>FA20260011-1</cbc:ID>');
  expect(xml).toContain('mimeCode="application/pdf" filename="dodaci-protokol.pdf"');
  expect(xml).not.toContain('zmluva.docx');

  // An attachment added on another device: the sending stops and names it.
  await send(elsewhere);
  await expect(a.page.locator('.toast', { hasText: 'protokol-z-ineho-pc.pdf' })).toBeVisible({ timeout: 20_000 });
  expect(provider.sent).toHaveLength(1);

  await a.context.close();
});
