// Buttons side by side keep a gap. Every screen and every settings section
// is opened by a fresh load, so only the stylesheets it loads itself are in
// force: a screen that borrows a row class from the stylesheet of another
// screen showed its buttons glued together until that other screen had
// been opened (the sync section with the export one, 30 October 2026).
// Segmented controls, whose buttons touch on purpose, are left out.
import { test, expect } from '@playwright/test';
import { seed, offline } from './support/seed.js';
import { layoutFile } from './support/layout-data.js';
import { FakeDrive, newDevice, turnOnEncryption } from './support/fake-drive.js';
import { seed as seedFiles, company } from './support/seed.js';
import { ALL_ROUTES } from '../../app/src/views/shell/nav.js';
import { SETTINGS_SECTIONS } from '../../app/src/views/settings/registry.js';

const DETAILS = ['contacts/e2e-contact-2', 'invoices/e2e-doc-FA20260001', 'invoices/new', 'items/e2e-item-2', 'recurring/e2e-rec-1'];
const SCREENS = [...ALL_ROUTES, ...DETAILS, ...SETTINGS_SECTIONS.map(s => `settings/${s.id}`)];

/** Pairs of sibling buttons on one line closer than minGap px. */
async function gluedButtons(page, minGap = 4) {
  return page.evaluate((minGap) => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const joined = '[role="tablist"], [role="radiogroup"], [role="group"], .segmented, .seg, .density-toggle, .btn-group, .input-group';
    const label = (el) => `"${(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"`;
    const found = [];
    const buttons = [...document.querySelectorAll('#main button, #main .btn, .modal-content button, .modal-content .btn')]
      .filter(b => visible(b) && !b.closest(joined));
    const byParent = new Map();
    buttons.forEach(b => byParent.set(b.parentElement, [...(byParent.get(b.parentElement) || []), b]));
    for (const [parent, list] of byParent) {
      const rects = list.map(b => b.getBoundingClientRect());
      for (let i = 0; i < list.length; i++) {
        for (let j = 0; j < list.length; j++) {
          const a = rects[i]; const b = rects[j];
          if (i === j || b.left < a.left) continue;
          const sameLine = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) / 2;
          const gap = b.left - a.right;
          if (sameLine && gap > -2 && gap < minGap) found.push(`${parent.className || parent.tagName}: ${label(list[i])} and ${label(list[j])} ${Math.round(gap)}px apart`);
        }
      }
    }
    return found;
  }, minGap);
}

test('buttons side by side keep a gap on every screen opened on its own', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop width is enough; phones stack the rows');
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+02:00'));
  await offline(page);
  await seed(page, layoutFile(), { hash: '#/dashboard' });
  const problems = [];
  for (const screen of SCREENS) {
    await page.goto(`./#/${screen}`);
    await page.reload();
    await expect(page.locator('main#main h1').first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(300);
    problems.push(...(await gluedButtons(page)).map(p => `${screen}: ${p}`));
  }
  expect(problems).toEqual([]);
});

test('the sync section of a signed-in user keeps its buttons apart', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one width is enough');
  test.setTimeout(120_000);
  const drive = new FakeDrive();
  const a = await newDevice(browser, testInfo, drive);
  await seedFiles(a.page, { company: company() });
  await turnOnEncryption(a.page, 'Silne-Heslo-2026', expect);
  await a.page.goto('./#/settings/sync');
  await a.page.reload();
  await expect(a.page.locator('#settings-sync-signOut')).toBeVisible({ timeout: 15_000 });
  expect(await gluedButtons(a.page)).toEqual([]);
  await a.context.close();
});
