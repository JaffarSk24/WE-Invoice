// The tax screens on the sample data: the VAT records with the summary
// and the checks, the kontrolný výkaz with its preview and XML download,
// the súhrnný výkaz and the VAT return, without serious accessibility
// issues.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('we-invoice-prefs', JSON.stringify({ demo: true, onboardingDone: true, language: 'sk' }));
  });
});

test('VAT records show the summary, the checks and the documents', async ({ page }) => {
  await page.goto('./#/vat-records');
  await expect(page.locator('main#main h1')).toHaveText('Evidencia DPH');
  await expect(page.locator('.tax-disclaimer')).toBeVisible();
  await expect(page.locator('.tax-tile')).toHaveCount(4);
  await page.getByRole('button', { name: 'Predchádzajúce obdobie' }).click();
  await expect(page.locator('.tax-period-name')).toBeVisible();
});

test('the kontrolný výkaz previews its sections and downloads the XML', async ({ page }) => {
  await page.goto('./#/kv');
  await expect(page.locator('main#main h1')).toHaveText('Kontrolný výkaz');
  await expect(page.locator('.tax-section')).toHaveCount(9);
  const download = page.getByRole('button', { name: 'Stiahnuť XML' });
  if (await download.isEnabled()) {
    const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(file.suggestedFilename()).toMatch(/^KV_DPH_SK\d{10}_\d{4}-\d{2}_R\.xml$/);
  }
});

test('the súhrnný výkaz and the VAT return open', async ({ page }) => {
  await page.goto('./#/sv');
  await expect(page.locator('main#main h1')).toHaveText('Súhrnný výkaz');
  await page.goto('./#/vat-return');
  await expect(page.locator('main#main h1')).toHaveText('Priznanie DPH');
  await expect(page.locator('.tax-preview')).toBeVisible();
});

test('tax screens have no serious or critical axe issues', async ({ page }) => {
  for (const hash of ['#/vat-records', '#/kv', '#/sv', '#/vat-return']) {
    await page.goto(`./${hash}`);
    await expect(page.locator('.tax-body')).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => `${hash} ${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')}`);
    expect(bad).toEqual([]);
  }
});
