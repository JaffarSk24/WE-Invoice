// The main path with the keyboard only (test plan § 11.4, accessibility):
// from the menu to a new invoice, the client picked from the suggestions,
// a line typed in, the invoice issued and its PDF downloaded, without a
// mouse. Every step moves the focus with Tab and acts with Enter or the
// arrows, and the focused element is always visible.
import { test, expect } from '@playwright/test';
import { seed, company, contact, live, offline } from './support/seed.js';

async function tabTo(page, selector, max = 120) {
  for (let i = 0; i < max; i += 1) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((sel) => {
      const el = document.activeElement;
      if (!el || !el.matches(sel)) return false;
      const box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    }, selector);
    if (hit) return;
  }
  throw new Error(`${selector} was not reached with Tab`);
}

test('new invoice, issue and PDF with the keyboard only', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a keyboard path of the desktop');
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00+02:00'));
  await offline(page);
  await seed(page, { company: company(), contacts: [contact()] });
  await page.locator('body').focus();

  await tabTo(page, '#btn-new-invoice');
  await page.keyboard.press('Enter');
  await expect(page.locator('#editor-issue')).toBeVisible();

  await tabTo(page, '#editor-contact');
  await page.keyboard.type('Beta');
  await expect(page.locator('.editor-party .ac-item').first()).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.party-summary strong')).toHaveText('Beta Obchod, s. r. o.');

  await tabTo(page, '.line-item input[aria-label="Názov"]');
  await page.keyboard.type('Konzultácie');
  await tabTo(page, '.line-item input[aria-label="Množstvo"]');
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('2');
  await tabTo(page, '.line-item input[aria-label="Cena bez DPH"]');
  await page.keyboard.type('50');
  await page.keyboard.press('Tab');
  await expect(page.locator('.totals-payable')).toContainText('123,00');

  await tabTo(page, '#editor-issue');
  await page.keyboard.press('Enter');
  await expect(page.locator('main h1')).toHaveText(/Faktúra FA\d{8}/);

  await tabTo(page, '#detail-pdf');
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Enter')]);
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  expect((await live(page, 'documents')).map(d => d.status)).toEqual(['ISSUED']);
});
