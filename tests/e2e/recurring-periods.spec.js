// A recurring invoice over three periods (test plan § 11.3, scenario 5):
// the template starts in August, the app opens first in October and makes
// the August, September and October drafts once; opening it again makes
// nothing more, and the November run comes on its day.
import { test, expect } from '@playwright/test';
import { seed, company, contact, live, offline } from './support/seed.js';

test.describe.configure({ timeout: 90_000 });

const drafts = async (page) => (await live(page, 'documents')).filter(d => d.kind === 'INVOICE').map(d => d.issueDate).sort();

test('three periods are made once, then the next one on its day', async ({ page }) => {
  await offline(page);
  await page.clock.setFixedTime(new Date('2026-08-01T10:00:00+02:00'));
  await seed(page, { company: company(), contacts: [contact()] }, { hash: '#/recurring' });
  await page.locator('#recurring-new').click();
  await page.selectOption('#tpl-contact', { label: 'Beta Obchod, s. r. o.' });
  await page.locator('#tpl-lines .tpl-line-name').fill('Hosting {period}');
  await page.locator('#tpl-lines .tpl-line-price').fill('20');
  await page.fill('#tpl-first-run', '2026-08-05');
  await page.locator('#tpl-first-run').dispatchEvent('change');
  await page.locator('#tpl-save').click();
  await expect(page.locator('.data-table')).toContainText('5. 8. 2026');
  expect(await drafts(page)).toEqual([]);

  // The app is opened again only in October: three runs are due.
  await page.clock.setFixedTime(new Date('2026-10-06T09:00:00+02:00'));
  await page.reload();
  await expect(page.locator('.toast', { hasText: 'Vytvorené pravidelné faktúry: 3.' })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => drafts(page)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);
  const names = (await live(page, 'documents')).map(d => d.lines[0].name).sort();
  expect(names.every(n => !n.includes('{period}'))).toBe(true);

  // Idempotent: another start, same day, nothing new.
  await page.reload();
  await page.waitForTimeout(3500);
  expect(await drafts(page)).toHaveLength(3);
  await page.goto('./#/recurring');
  await expect(page.locator('.data-table')).toContainText('5. 11. 2026');

  await page.clock.setFixedTime(new Date('2026-11-05T08:00:00+01:00'));
  await page.reload();
  await expect(page.locator('.toast', { hasText: 'Vytvorené pravidelné faktúry: 1.' })).toBeVisible({ timeout: 10_000 });
  await expect.poll(() => drafts(page)).toEqual(['2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05']);
});
