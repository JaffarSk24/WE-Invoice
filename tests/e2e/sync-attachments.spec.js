// Attachments across two devices with Google Drive mocked: the file added
// on one device waits for its upload, goes to Drive sealed and named by
// its id only, opens on the other device (taken from Drive and kept
// there), and leaves Drive and the other device with the attachment.
import { test, expect } from '@playwright/test';
import { FakeDrive, newDevice, turnOnEncryption, unlockWith, syncNow } from './support/fake-drive.js';
import { seed, company, contact, invoice } from './support/seed.js';

test.describe.configure({ timeout: 150_000 });

const PASSWORD = 'Silne-Heslo-2026';
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const DOC = invoice();

const attachmentFiles = (drive) => drive.contents().filter(f => f.path.startsWith('e2e-company-1/attachments/'));

// The keys of the device store of attachment files (purchase/file-store.js).
function deviceFiles(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('we-invoice-inbox', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const keys = req.result.transaction('files').objectStore('files').getAllKeys();
      keys.onsuccess = () => { resolve(keys.result.map(String)); req.result.close(); };
      keys.onerror = () => reject(keys.error);
    };
  }));
}

test('an attachment goes to Drive, opens on the other device and leaves with its removal', async ({ browser }, testInfo) => {
  const drive = new FakeDrive();
  const a = await newDevice(browser, testInfo, drive);
  await seed(a.page, { company: company(), contacts: [contact()], documents: [DOC] });
  await turnOnEncryption(a.page, PASSWORD, expect);

  await a.page.goto(`./#/invoices/${DOC.id}`);
  const cardA = a.page.locator('.doc-attachments');
  await cardA.locator('input[type="file"]').setInputFiles([{ name: 'foto zmluvy.png', mimeType: 'image/png', buffer: PNG }]);
  const rowA = cardA.locator('.attachment-row', { hasText: 'foto zmluvy.png' });
  await expect(rowA.locator('.attachment-state')).toHaveText('Čaká na nahratie do Google Drive');

  await syncNow(a.page, drive, expect);
  await expect.poll(() => attachmentFiles(drive).length).toBe(1);
  const [stored] = attachmentFiles(drive);
  expect(stored.path).toMatch(/^e2e-company-1\/attachments\/[0-9a-f-]+\.enc$/);
  expect(stored.path).not.toContain('zmluvy');
  expect(stored.text).not.toContain('PNG');
  await a.page.goto(`./#/invoices/${DOC.id}`);
  await expect(a.page.locator('.doc-attachments .attachment-row .attachment-state')).toBeHidden();

  const b = await newDevice(browser, testInfo, drive);
  await b.page.goto('./');
  await unlockWith(b.page, PASSWORD, expect);
  await expect(b.page.locator('#company-switcher option:checked')).toHaveText('Biela Orlica s.r.o.', { timeout: 15_000 });
  await b.page.goto(`./#/invoices/${DOC.id}`);
  const rowB = b.page.locator('.doc-attachments .attachment-row', { hasText: 'foto zmluvy.png' });
  await expect(rowB.locator('.attachment-state')).toHaveText('V Google Drive');
  expect(await deviceFiles(b.page)).toEqual([]);
  const opened = b.page.waitForEvent('popup');
  await rowB.locator('.attachment-open').click();
  const tab = await opened;
  await expect.poll(() => tab.url()).toMatch(/^blob:/);
  await tab.close();
  await expect(rowB.locator('.attachment-state')).toBeHidden();
  const kept = await deviceFiles(b.page);
  expect(kept).toHaveLength(1);
  expect(stored.path).toContain(kept[0]);

  // Removed on the first device: gone from Drive, then from the second one.
  await a.page.goto(`./#/invoices/${DOC.id}`);
  await a.page.locator('.doc-attachments .attachment-row', { hasText: 'foto zmluvy.png' }).locator('.attachment-remove').click();
  await a.page.locator('.modal-content .btn-danger').click();
  await expect(a.page.locator('.doc-attachments .attachment-name')).toHaveCount(0);
  await syncNow(a.page, drive, expect);
  await expect.poll(() => attachmentFiles(drive).length).toBe(0);
  await syncNow(b.page, drive, expect);
  await expect.poll(() => deviceFiles(b.page)).toEqual([]);
  await b.page.goto(`./#/invoices/${DOC.id}`);
  await expect(b.page.locator('.doc-attachments .attachment-name')).toHaveCount(0);

  await a.context.close();
  await b.context.close();
});
