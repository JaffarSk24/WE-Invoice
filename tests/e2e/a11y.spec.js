// Accessibility (WCAG 2.1 AA): axe finds no serious or critical issue on
// the main screens, in the dark and the light theme.
import { test, expect } from '@playwright/test';
import { seriousIssues, auditTimeout } from './support/axe.js';

const SCREENS = ['#/dashboard', '#/onboarding', '#/settings/interface', '#/help', '#/more'];

for (const theme of ['dark', 'light']) {
  test(`no serious or critical axe issues (${theme})`, async ({ page }) => {
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
