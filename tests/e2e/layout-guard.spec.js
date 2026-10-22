// Layout guard: every screen of the menu, with a busy company (long names,
// every document kind), at 1440 and 375 px. The page never scrolls
// sideways, no text is squeezed into a column under 40 px where it breaks
// letter by letter, every table header has a th for each column of the
// first row, and cards side by side in a grid start on the same line.
// The screens are opened one after another in one page, as a user does,
// so a stylesheet that a screen loads late is in force on the next ones.
// Slovak is the reference; Russian has the longest labels, the ones that
// squeeze a value column first.
import { test, expect } from '@playwright/test';
import { seed, offline } from './support/seed.js';
import { layoutFile } from './support/layout-data.js';
import { layoutProblems } from './support/layout.js';
import { ALL_ROUTES } from '../../app/src/views/shell/nav.js';

// Detail screens after the menu: the contact card comes after the
// bookkeeping screens, whose stylesheet once pushed its cards down.
const DETAILS = ['contacts/e2e-contact-2', 'contacts/e2e-contact-1', 'invoices/e2e-doc-FA20260001', 'invoices/new', 'items/e2e-item-2', 'recurring/e2e-rec-1'];

async function check(page, screen) {
  await expect(page.locator('main#main h1').first()).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(400);
  return (await layoutProblems(page)).map(p => `${screen}: ${p}`);
}

for (const [language, width] of [['sk', 1440], ['sk', 375], ['ru', 1440], ['ru', 375]]) {
  test(`no broken layout on any screen at ${width} px (${language})`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'the widths are set here; the phone projects add nothing');
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height: width < 500 ? 812 : 900 });
    await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+02:00'));
    await offline(page);
    await seed(page, layoutFile(), { hash: '#/dashboard', prefs: { language } });
    // The running page writes its preferences back on navigation; set the
    // language again and start it fresh.
    await page.evaluate((l) => localStorage.setItem('we-invoice-prefs', JSON.stringify({ onboardingDone: true, language: l })), language);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    const problems = [];
    for (const screen of [...ALL_ROUTES, ...DETAILS]) {
      await page.goto(`./#/${screen}`);
      problems.push(...await check(page, screen));
    }
    // The documents of a contact are a table in a tab of the card.
    await page.goto('./#/contacts/e2e-contact-2');
    await page.locator('[role="tab"]').nth(1).click();
    await expect(page.locator('table.contact-docs')).toBeVisible();
    problems.push(...await check(page, 'contacts/e2e-contact-2 documents'));
    expect(problems).toEqual([]);
  });
}
