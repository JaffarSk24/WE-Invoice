// The reports module on the sample data: every report tab draws, and the
// reports, search, recycle bin and change log screens have no serious or
// critical axe issue (WCAG 2.1 AA) in either theme.
import { test, expect } from '@playwright/test';
import { seriousIssues, auditTimeout } from './support/axe.js';

const SCREENS = ['#/reports', '#/search?q=a', '#/trash', '#/audit'];

test('the reports draw every tab from the sample data', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('we-invoice-prefs', JSON.stringify({ demo: true, onboardingDone: true, reportsPeriod: { preset: 'all', granularity: 'month' } }));
  });
  await page.goto('./#/reports');
  await expect(page.locator('main#main h1')).toHaveText('Prehľady');
  const tabs = page.locator('.report-tabs [role="tab"]');
  await expect(tabs).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    await tabs.nth(i).click();
    await expect(page.locator('.report-tabs [role="tabpanel"]:not([hidden]) .report-cards').first()).toBeVisible();
  }
  await tabs.first().click();
  await expect(page.locator('.report-tabs [role="tabpanel"]:not([hidden]) svg.chart-svg')).toBeVisible();
});

for (const theme of ['dark', 'light']) {
  test(`reports screens have no serious or critical axe issues (${theme})`, async ({ page }) => {
    test.setTimeout(auditTimeout(SCREENS.length));
    await page.addInitScript((t) => {
      localStorage.setItem('we-invoice-prefs', JSON.stringify({ theme: t, demo: true, onboardingDone: true }));
    }, theme);
    for (const hash of SCREENS) {
      await page.goto(`./${hash}`);
      await expect(page.locator('main#main h1').first()).toBeVisible();
      const bad = await seriousIssues(page, hash);
      expect(bad).toEqual([]);
    }
  });
}
