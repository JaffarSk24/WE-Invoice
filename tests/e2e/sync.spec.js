// A device that is not connected is asked to sign in with Google at start;
// "Later" closes the dialog and the app goes on without the cloud.
import { test, expect } from '@playwright/test';

test('the sign-in dialog opens at start and can be postponed', async ({ page }) => {
  await page.goto('./');
  const dialog = page.locator('.modal-content[role="dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('h3')).toHaveText('Prihlásenie cez Google');
  await dialog.getByRole('button', { name: 'Neskôr' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('main#main h1')).toBeVisible();
  // Postponed for the session: a reload does not ask again.
  await page.reload();
  await expect(page.locator('main#main h1')).toBeVisible();
  await expect(page.locator('.modal-content[role="dialog"]')).toHaveCount(0);
});
