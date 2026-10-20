// Encryption end to end with Google Drive mocked (test plan § 11.3,
// scenario 7): turning it on with a password and the 24-word recovery key,
// signing out, signing in again with the password, changing the password,
// and opening the data on a new device with the recovery key after the
// old password stopped working. Nothing readable ever lands in Drive.
import { test, expect } from '@playwright/test';
import { FakeDrive, newDevice, signInAgain } from './support/fake-drive.js';
import { seed, company, contact, invoice } from './support/seed.js';

test.describe.configure({ timeout: 120_000 });

const FIRST = 'Silne-Heslo-2026';
const SECOND = 'Nove-Heslo-2027';
const THIRD = 'Tretie-Heslo-2028';
const modal = (page, title) => page.locator('.modal-content[role="dialog"]', { has: page.locator('h3', { hasText: title }) });

async function syncSettings(page) {
  await page.goto('./#/settings/sync');
  await expect(page.locator('#settings-sync-status')).toBeVisible();
}

test('encryption: on, sign out, password, new password, recovery key', async ({ browser }, testInfo) => {
  const drive = new FakeDrive();
  const a = await newDevice(browser, testInfo, drive);
  await seed(a.page, { company: company(), contacts: [contact()], documents: [invoice()] });

  // First sync: Drive is empty, so the app asks for the password.
  const setup = modal(a.page, 'Heslo na šifrovanie');
  await expect(setup).toBeVisible({ timeout: 15_000 });
  await setup.getByLabel('Heslo (aspoň 8 znakov)').fill(FIRST);
  await setup.getByLabel('Heslo ešte raz').fill(FIRST);
  await setup.getByRole('button', { name: 'Zašifrovať' }).click();

  const recovery = modal(a.page, 'Obnovovací kľúč');
  await expect(recovery.locator('.sync-words li')).toHaveCount(24);
  const words = (await recovery.locator('.sync-words li').allInnerTexts()).map(w => w.trim());
  await recovery.getByRole('button', { name: 'Mám ho uložený' }).click();
  const check = modal(a.page, 'Overenie kľúča');
  for (const field of await check.locator('.sync-field').all()) {
    const n = Number((await field.locator('label').innerText()).replace(/\D/g, ''));
    await field.locator('input').fill(words[n - 1]);
  }
  await check.getByRole('button', { name: 'Potvrdiť' }).click();
  await expect(a.page.locator('.toast', { hasText: 'Šifrovanie je zapnuté' })).toBeVisible({ timeout: 15_000 });

  // The e2e build derives the keys with few PBKDF2 rounds (app/vite.config.js,
  // mode e2e); the header records them, as it would 600 000 in a real build.
  const header = await a.page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('we-invoice', 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const get = req.result.transaction('files').objectStore('files').get('workspace');
      get.onsuccess = () => { resolve(JSON.parse(get.result).keys); req.result.close(); };
      get.onerror = () => reject(get.error);
    };
  }));
  expect(header).toMatchObject({ kdf: 'PBKDF2-SHA256', iterations: 1000 });

  const stored = drive.contents();
  expect(stored.some(f => f.path.endsWith('.enc'))).toBe(true);
  expect(stored.filter(f => /Biela Orlica|Beta Obchod|FA20260001/.test(f.text)).map(f => f.path)).toEqual([]);

  // Sign out: this device keeps working on its own.
  await syncSettings(a.page);
  await a.page.locator('#settings-sync-signOut').click();
  await expect(a.page.locator('#settings-sync-signIn')).toBeVisible();
  await expect(a.page.locator('#settings-sync-status')).toHaveText('Len v tomto zariadení');

  // Signed in again: the key was dropped, so the password is asked for.
  await signInAgain(a.page);
  await a.page.reload();
  const unlock = modal(a.page, 'Zadajte heslo');
  await expect(unlock).toBeVisible({ timeout: 15_000 });
  await unlock.locator('input[type="password"]').fill('nespravne-heslo');
  await unlock.getByRole('button', { name: 'Odomknúť' }).click();
  await expect(unlock.locator('.sync-error')).toHaveText('Nesprávne heslo.');
  await unlock.locator('input[type="password"]').fill(FIRST);
  await unlock.getByRole('button', { name: 'Odomknúť' }).click();
  await expect(unlock).toHaveCount(0);

  // A new password.
  await syncSettings(a.page);
  await expect(a.page.locator('#settings-sync-status')).toHaveText('Synchronizované');
  await a.page.locator('#settings-sync-changePassword').click();
  const change = modal(a.page, 'Zmena hesla');
  await change.getByLabel('Súčasné heslo').fill(FIRST);
  await change.getByLabel('Nové heslo', { exact: true }).fill(SECOND);
  await change.getByLabel('Nové heslo ešte raz').fill(SECOND);
  await change.getByRole('button', { name: 'Zmeniť heslo' }).click();
  await expect(a.page.locator('.toast', { hasText: 'Heslo je zmenené.' })).toBeVisible({ timeout: 15_000 });

  // A new device: the old password no longer opens the data, the
  // recovery key does and sets a third password.
  const b = await newDevice(browser, testInfo, drive);
  await b.page.goto('./');
  const unlockB = modal(b.page, 'Zadajte heslo');
  await expect(unlockB).toBeVisible({ timeout: 15_000 });
  await unlockB.locator('input[type="password"]').fill(FIRST);
  await unlockB.getByRole('button', { name: 'Odomknúť' }).click();
  await expect(unlockB.locator('.sync-error')).toHaveText('Nesprávne heslo.');
  await unlockB.getByRole('button', { name: 'Zabudli ste heslo?' }).click();
  const recover = modal(b.page, 'Obnovenie kľúčom');
  await recover.getByLabel('Obnovovací kľúč (24 slov)').fill(words.join(' '));
  await recover.getByLabel('Nové heslo', { exact: true }).fill(THIRD);
  await recover.getByLabel('Heslo ešte raz').fill(THIRD);
  await recover.getByRole('button', { name: 'Obnoviť a nastaviť heslo' }).click();
  await expect(b.page.locator('.toast', { hasText: 'Heslo je nastavené a dáta sú odomknuté.' })).toBeVisible({ timeout: 15_000 });
  await expect(b.page.locator('#company-switcher option:checked')).toHaveText('Biela Orlica s.r.o.', { timeout: 15_000 });
  await b.page.goto('./#/invoices');
  await expect(b.page.locator('.data-table')).toContainText('FA20260001');

  await a.context.close();
  await b.context.close();
});
