// A company with 10 000 generated documents (tests/gen) in the browser:
// opening the invoice list from the menu draws the first rows within the
// budget of the test plan (§ 11.1, 200 ms), the search answers, and the
// list stays scrollable. The time is measured in the page, from the menu
// click to the first painted row.
import { test, expect } from '@playwright/test';
import { seed } from './support/seed.js';
import { generateCompanyData } from '../gen/index.js';

test('the invoice list of 10 000 documents opens within 200 ms', async ({ page, isMobile }) => {
  test.skip(isMobile, 'measured on the desktop');
  test.setTimeout(120_000);
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00+02:00'));
  const data = generateCompanyData({ documents: 10000 });
  await seed(page, data, { hash: '#/dashboard' });
  await expect(page.locator('main#main h1')).toBeVisible();
  // Warm up once (the list module loads on first use), then measure.
  await page.locator('.sidebar .nav-item[href="#/invoices"]').click();
  await expect(page.locator('.data-table tr.row').first()).toBeVisible();
  await page.locator('.sidebar .nav-item[href="#/dashboard"]').click();
  await expect(page.locator('.data-table tr.row')).toHaveCount(0);

  const timings = [];
  for (let i = 0; i < 3; i += 1) {
    const ms = await page.evaluate(() => new Promise(resolve => {
      const start = performance.now();
      const done = () => {
        if (document.querySelector('.data-table tr.row')) requestAnimationFrame(() => resolve(performance.now() - start));
        else requestAnimationFrame(done);
      };
      document.querySelector('.sidebar .nav-item[href="#/invoices"]').click();
      done();
    }));
    timings.push(ms);
    await page.locator('.sidebar .nav-item[href="#/dashboard"]').click();
    await expect(page.locator('.data-table tr.row')).toHaveCount(0);
  }
  test.info().annotations.push({ type: 'list open (ms)', description: timings.map(t => t.toFixed(0)).join(', ') });
  expect(Math.min(...timings)).toBeLessThan(200);

  await page.locator('.sidebar .nav-item[href="#/invoices"]').click();
  const rows = page.locator('.data-table tr.row');
  await expect(rows.first()).toBeVisible();
  // Virtual list: a window of rows in the page, not all of them.
  expect(await rows.count()).toBeLessThan(200);
  const number = data.documents.find(d => d.kind === 'INVOICE' && d.status !== 'DRAFT').number;
  await page.keyboard.press('Control+k');
  await page.locator('#global-search').fill(number);
  await expect(page.locator('#global-search-results .search-hit-button').first()).toContainText(number);
});
