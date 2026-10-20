// Attachments across two devices with Google Drive mocked: the file added
// on one device waits for its upload, goes to Drive sealed and named by
// its id only and opens on the other device (taken from Drive and kept
// there). Removed from a draft, it leaves Drive and the other device;
// removed from an issued invoice, it disappears from the screens but its
// file stays in Drive for the archive and the change log records it.
import { test, expect } from '@playwright/test';
import { FakeDrive, newDevice, turnOnEncryption, unlockWith, syncNow } from './support/fake-drive.js';
import { seed, company, contact, invoice, live } from './support/seed.js';

test.describe.configure({ timeout: 150_000 });

const PASSWORD = 'Silne-Heslo-2026';
const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const DOC = invoice();
const DRAFT = invoice({ id: 'e2e-draft-1', status: 'DRAFT', number: null, vs: null });

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

// Device A with the company, both documents and encryption on, an attachment
// added to `doc` and uploaded; device B unlocked, with the file opened (so
// it is kept there too). Returns the devices and the Drive path of the file.
async function shared(browser, testInfo, drive, doc) {
  const a = await newDevice(browser, testInfo, drive);
  await seed(a.page, { company: company(), contacts: [contact()], documents: [DOC, DRAFT] });
  await turnOnEncryption(a.page, PASSWORD, expect);

  await a.page.goto(`./#/invoices/${doc.id}`);
  const panelA = a.page.locator('main .attachment-list').locator('..');
  await panelA.locator('input[type="file"]').setInputFiles([{ name: 'foto zmluvy.png', mimeType: 'image/png', buffer: PNG }]);
  const rowA = a.page.locator('main .attachment-row', { hasText: 'foto zmluvy.png' });
  await expect(rowA.locator('.attachment-state')).toHaveText('Čaká na nahratie do Google Drive');

  await syncNow(a.page, drive, expect);
  await expect.poll(() => attachmentFiles(drive).length).toBe(1);
  const [stored] = attachmentFiles(drive);
  expect(stored.path).toMatch(/^e2e-company-1\/attachments\/[0-9a-f-]+\.enc$/);
  expect(stored.path).not.toContain('zmluvy');
  expect(stored.text).not.toContain('PNG');
  await a.page.goto(`./#/invoices/${doc.id}`);
  await expect(a.page.locator('main .attachment-row .attachment-state')).toBeHidden();

  const b = await newDevice(browser, testInfo, drive);
  await b.page.goto('./');
  await unlockWith(b.page, PASSWORD, expect);
  await expect(b.page.locator('#company-switcher option:checked')).toHaveText('Biela Orlica s.r.o.', { timeout: 15_000 });
  await b.page.goto(`./#/invoices/${doc.id}`);
  const rowB = b.page.locator('main .attachment-row', { hasText: 'foto zmluvy.png' });
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
  return { a, b, stored };
}

test('an attachment of a draft goes to Drive, opens on the other device and leaves with its removal', async ({ browser }, testInfo) => {
  const drive = new FakeDrive();
  const { a, b } = await shared(browser, testInfo, drive, DRAFT);

  // A draft asks nothing: the attachment goes, and its file with it.
  await a.page.goto(`./#/invoices/${DRAFT.id}`);
  await a.page.locator('main .attachment-row', { hasText: 'foto zmluvy.png' }).locator('.attachment-remove').click();
  await expect(a.page.locator('main .attachment-name')).toHaveCount(0);
  await syncNow(a.page, drive, expect);
  await expect.poll(() => attachmentFiles(drive).length).toBe(0);
  await syncNow(b.page, drive, expect);
  await expect.poll(() => deviceFiles(b.page)).toEqual([]);
  await b.page.goto(`./#/invoices/${DRAFT.id}`);
  await expect(b.page.locator('main .attachment-name')).toHaveCount(0);

  await a.context.close();
  await b.context.close();
});

test('an attachment removed from an issued invoice leaves the screens but its file stays in Drive', async ({ browser }, testInfo) => {
  const drive = new FakeDrive();
  const { a, b, stored } = await shared(browser, testInfo, drive, DOC);

  await a.page.goto(`./#/invoices/${DOC.id}`);
  await a.page.locator('main .attachment-row', { hasText: 'foto zmluvy.png' }).locator('.attachment-remove').click();
  await expect(a.page.locator('.modal-content')).toContainText('foto zmluvy.png');
  await a.page.locator('.modal-content .btn-danger').click();
  await expect(a.page.locator('main .attachment-name')).toHaveCount(0);
  await syncNow(a.page, drive, expect);
  await syncNow(b.page, drive, expect);
  // The file stays in Drive and on the device that had it.
  expect(attachmentFiles(drive).map(f => f.path)).toEqual([stored.path]);
  expect(await deviceFiles(b.page)).toHaveLength(1);
  await b.page.goto(`./#/invoices/${DOC.id}`);
  await expect(b.page.locator('main .attachment-name')).toHaveCount(0);
  const [docB] = (await live(b.page, 'documents')).filter(d => d.id === DOC.id);
  expect(docB.attachments).toEqual([]);
  expect(docB.removedAttachments).toEqual([expect.objectContaining({ name: 'foto zmluvy.png', mime: 'image/png', reason: 'REMOVED_BY_USER' })]);
  // The change log still shows the removal.
  const log = (await live(b.page, 'auditLog')).filter(e => e.entityId === DOC.id && e.reason === 'attachment removed');
  expect(log.map(e => e.changes)).toEqual([[{ field: 'attachments', from: 'foto zmluvy.png', to: null }]]);

  await a.context.close();
  await b.context.close();
});
