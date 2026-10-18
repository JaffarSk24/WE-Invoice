// Accessibility (WCAG 2.1 AA): axe finds no serious or critical issue on
// the main screens, in the dark and the light theme.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const SCREENS = ['#/dashboard', '#/onboarding', '#/settings/interface', '#/help', '#/more'];

for (const theme of ['dark', 'light']) {
  test(`no serious or critical axe issues (${theme})`, async ({ page }) => {
    await page.addInitScript((t) => {
      localStorage.setItem('we-invoice-prefs', JSON.stringify({ theme: t, demo: true, onboardingDone: true }));
    }, theme);
    for (const hash of SCREENS) {
      await page.goto(`./${hash}`);
      await expect(page.locator('main#main h1').first()).toBeVisible();
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const bad = result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
        .map(v => `${hash} ${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')}`);
      expect(bad).toEqual([]);
    }
  });
}
