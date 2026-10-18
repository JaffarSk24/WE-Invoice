// A device that is not connected is offered Google sign-in at start
// without blocking the app; the offer opens the sign-in dialog, which
// "Later" closes.
import { test, expect } from '@playwright/test';

test('sign-in is offered at start and the dialog can be postponed', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('main#main h1')).toBeVisible();
  const offer = page.locator('.toast .toast-action', { hasText: 'Prihlásiť sa cez Google' });
  await expect(offer).toBeVisible();
  await offer.click();
  const dialog = page.locator('.modal-content[role="dialog"]');
  await expect(dialog.locator('h3')).toHaveText('Prihlásenie cez Google');
  await dialog.getByRole('button', { name: 'Neskôr' }).click();
  await expect(dialog).toHaveCount(0);
  // Offered once per session: a reload does not ask again.
  await page.reload();
  await expect(page.locator('main#main h1')).toBeVisible();
  await expect(page.locator('.toast .toast-action', { hasText: 'Prihlásiť sa cez Google' })).toHaveCount(0);
});
