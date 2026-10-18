// Export for the accountant: with the sample data, a month that has
// documents goes out as one ZIP with the summary, the register, Pohoda XML,
// ISDOC and the PDFs, and the sample data stays as it was.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { readZip } from '../../packages/core/imports/zip.js';

const pad = (n) => String(n).padStart(2, '0');

function monthsBack(i, today = new Date()) {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(last)}` };
}

test('a month of documents goes to the accountant as one ZIP', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem('we-invoice-prefs', JSON.stringify({ demo: true, onboardingDone: true }));
  });
  await page.goto('./#/exim/export');
  await expect(page.locator('main#main h1')).toBeVisible();
  const button = page.locator('#exim-export-zip');
  await expect(button).toBeVisible();

  // The sample data is spread over the last fourteen months: take the
  // latest month that has documents.
  let month = null;
  for (let i = 0; i < 14 && !month; i++) {
    const range = monthsBack(i);
    await page.selectOption('#exim-export-period', 'custom');
    await page.fill('#exim-export-from', range.from);
    await page.locator('#exim-export-from').dispatchEvent('change');
    await page.fill('#exim-export-to', range.to);
    await page.locator('#exim-export-to').dispatchEvent('change');
    if (await button.isEnabled()) month = range;
  }
  expect(month).not.toBeNull();

  const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
  expect(download.suggestedFilename()).toMatch(new RegExp(`_${month.from}_${month.to}\\.zip$`));
  const files = await readZip(new Uint8Array(readFileSync(await download.path())));
  const names = [...files.keys()];
  expect(names[0]).toMatch(/\.txt$/);
  expect(names).toEqual(expect.arrayContaining(['doklady.csv', 'polozky.csv', 'doklady.xlsx', 'pohoda.xml']));
  expect(names.some(n => n.startsWith('isdoc/'))).toBe(true);
  expect(names.some(n => n.startsWith('pdf/') && n.endsWith('.pdf'))).toBe(true);
  const register = new TextDecoder().decode(files.get('doklady.csv'));
  expect(register.split('\r\n').length).toBeGreaterThan(2);
  await expect(page.locator('.toast-success')).toBeVisible();
});
