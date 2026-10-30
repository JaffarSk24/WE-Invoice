// Accessibility of the whole app (test plan § 11.1): axe (WCAG 2.1 AA)
// finds no serious or critical issue on any screen of the menu with a real
// company and its documents, nor in the main dialogs: the editor, the card
// of a document, the payment, the statement import, the company wizard.
// The menu screens are audited one menu group per test, so each test stays
// short and the groups spread over the workers.
import { test, expect } from '@playwright/test';
import { NAV } from '../../app/src/views/shell/nav.js';
import { seed, company, contact, invoice, offline } from './support/seed.js';
import { seriousIssues as serious, auditTimeout } from './support/axe.js';

const DOC = invoice();

// The routes of the menu by group, the phone's More screen with the last.
const GROUPS = NAV.map((g, i) => ({ name: g.title ? g.title.replace('nav.group.', '') : `group-${i + 1}`, routes: g.items.map(item => item.route) }));
GROUPS[GROUPS.length - 1].routes.push('more');

for (const theme of ['light', 'dark']) for (const group of GROUPS) {
  test(`menu screens of ${group.name} with a real company (${theme})`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'the screens are checked once, on the desktop; the phone layout below');
    test.setTimeout(auditTimeout(group.routes.length));
    await offline(page);
    await seed(page, { company: company(), contacts: [contact()], documents: [DOC] }, { prefs: { theme } });
    const bad = [];
    for (const route of group.routes) {
      await page.goto(`./#/${route}`);
      await expect(page.locator('main#main h1').first()).toBeVisible();
      await page.waitForTimeout(400);
      bad.push(...await serious(page, route));
    }
    expect(bad).toEqual([]);
  });
}

test('the main dialogs', async ({ page }) => {
  test.setTimeout(auditTimeout(8));
  await offline(page);
  await seed(page, { company: company(), contacts: [contact()], documents: [DOC] }, { hash: '#/invoices/new?contact=e2e-contact-1' });
  const bad = [];
  await expect(page.locator('#editor-issue')).toBeVisible();
  bad.push(...await serious(page, 'editor'));
  await page.locator('#editor-new-contact').click();
  await expect(page.locator('.modal-content')).toBeVisible();
  bad.push(...await serious(page, 'new contact'));
  await page.keyboard.press('Escape');

  await page.goto(`./#/invoices/${DOC.id}`);
  await expect(page.locator('#detail-add-payment')).toBeVisible();
  bad.push(...await serious(page, 'card'));
  await page.locator('#detail-add-payment').click();
  await expect(page.locator('#payment-amount')).toBeVisible();
  bad.push(...await serious(page, 'payment'));
  await page.keyboard.press('Escape');
  await page.locator('#detail-send').click();
  await expect(page.locator('#mail-to')).toBeVisible();
  bad.push(...await serious(page, 'e-mail'));
  await page.keyboard.press('Escape');

  await page.goto('./#/bank');
  await page.locator('.view-actions .btn-primary').click();
  await expect(page.locator('.modal-content .file-drop')).toBeVisible();
  bad.push(...await serious(page, 'statement drop'));
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.file-drop [data-action="choose"]').click();
  await (await chooser).setFiles({ name: 'vypis.xml', mimeType: 'application/xml', buffer: Buffer.from((await import('node:fs')).readFileSync(new URL('../fixtures/bank/camt053.xml', import.meta.url))) });
  await expect(page.locator('.import-body')).toBeVisible();
  bad.push(...await serious(page, 'statement import'));
  await page.locator('.modal-actions .btn-primary').click();
  await expect(page.locator('.modal-content', { hasText: 'Párovanie platieb' })).toBeVisible();
  bad.push(...await serious(page, 'matching'));
  await page.keyboard.press('Escape');

  await page.goto('./#/onboarding');
  await page.locator('#ob-next').click();
  await page.locator('label.radio-card', { hasText: 'Vyskúšať bez prihlásenia' }).click();
  await page.locator('#ob-next').click();
  await expect(page.locator('#ob-ico')).toBeVisible();
  bad.push(...await serious(page, 'wizard'));
  expect(bad).toEqual([]);
});
