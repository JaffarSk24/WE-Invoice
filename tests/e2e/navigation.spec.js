// Navigation of the shell on the three viewports: sidebar groups with the
// Beta badge, search on Ctrl/Cmd+K, the White Eagles strip on desktop,
// the phone bottom bar with its FAB menu and the More screen.
import { test, expect } from '@playwright/test';

test('desktop sidebar, search shortcut and the White Eagles strip', async ({ page, isMobile }) => {
  test.skip(isMobile, 'desktop only');
  await page.goto('./');
  const sidebar = page.locator('.sidebar');
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator('.nav-badge')).toHaveText('Beta');
  await expect(sidebar.locator('#sync-status')).toContainText('Len v tomto zariadení');
  await expect(sidebar.locator('.nav-item[href="#/kv"]')).toBeVisible();

  const strip = page.locator('footer.promo-footer:not(.promo-inline)');
  await expect(strip).toBeVisible();
  // One strip on a wide screen: the inline copy is for phones only.
  await expect(page.locator('footer.promo-inline')).toBeHidden();
  await expect(strip.locator('.promo-badge')).toHaveText('White Eagles');
  const link = strip.locator('a');
  await expect(link).toHaveAttribute('href', 'https://whiteeagles.sk/');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', 'noopener');
  await expect(strip).toContainText(`${new Date().getFullYear()} White Eagles & Co. s. r. o.`);
  await expect(sidebar.locator('.promo')).toHaveCount(0);

  await page.keyboard.press('Control+k');
  await expect(page.locator('#global-search')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#global-search')).toHaveCount(0);

  await sidebar.locator('.nav-item[href="#/help"]').click();
  await expect(page.locator('main#main h1')).toHaveText('Nápoveda');
  await page.locator('.help-item[data-topic="efaktura2027"] .help-row').click();
  await expect(page.locator('#help-body-efaktura2027')).toBeVisible();
});

test('phone bottom bar, FAB menu and the More screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone only');
  await page.goto('./');
  await expect(page.locator('.sidebar')).toBeHidden();
  await expect(page.locator('footer.promo-footer:not(.promo-inline)')).toBeHidden();
  const fab = page.locator('.bottom-bar .fab');
  const box = await fab.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44);
  await fab.click();
  await expect(fab).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#fab-menu [role="menuitem"]')).toHaveCount(4);
  await page.locator('#fab-menu [data-action="expense"]').click();
  await expect(page).toHaveURL(/#\/expenses/);

  await page.locator('.bottom-item[href="#/more"]').click();
  await expect(page.locator('main#main h1')).toHaveText('Viac');
  const inline = page.locator('main#main footer.promo-inline');
  await inline.scrollIntoViewIfNeeded();
  await expect(inline).toBeVisible();
  await expect(inline.locator('a')).toHaveAttribute('href', 'https://whiteeagles.sk/');
  for (const item of await page.locator('.bottom-item').all()) {
    const b = await item.boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
});

test('language and theme from the settings', async ({ page }) => {
  await page.goto('./#/settings/interface');
  await expect(page.locator('#settings-language')).toBeVisible();
  await page.selectOption('#settings-language', 'en');
  await expect(page.locator('main#main h1')).toHaveText('Settings');
  await page.selectOption('#settings-theme', 'light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.selectOption('#settings-density', 'compact');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('main#main h1')).toHaveText('Settings');
});
