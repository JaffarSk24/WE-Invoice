// The landing page in a browser: the static files of site/ are served from
// a fake origin through route interception. Covers the root redirect, the
// consent banner and the eFaktura block that leads to the app.
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';

const ORIGIN = 'https://site.test';
const SITE = new URL('../../site/', import.meta.url);
const TYPES = { html: 'text/html', css: 'text/css', js: 'text/javascript', png: 'image/png', xml: 'application/xml', txt: 'text/plain' };

async function serveSite(page) {
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url());
    let path = url.pathname.replace(/^\//, '');
    if (path === '' || path.endsWith('/')) path += 'index.html';
    const file = new URL(path, SITE);
    if (!existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    const ext = path.split('.').pop();
    return route.fulfill({ status: 200, contentType: TYPES[ext] || 'application/octet-stream', body: readFileSync(file) });
  });
}

test.describe('site', () => {
  test.beforeEach(async ({ page }) => serveSite(page));

  test('root redirects by browser language and the switcher is remembered', async ({ page }) => {
    await page.goto(`${ORIGIN}/`);
    await expect(page).toHaveURL(`${ORIGIN}/sk/`);
    await page.locator('nav.langs a[hreflang="en"]').click();
    await expect(page).toHaveURL(`${ORIGIN}/en/index.html`);
    await page.goto(`${ORIGIN}/privacy.html`);
    await expect(page).toHaveURL(`${ORIGIN}/en/privacy.html`);
  });

  test('consent banner shows once and hides after a choice', async ({ page }) => {
    await page.goto(`${ORIGIN}/sk/`);
    const banner = page.locator('#consent');
    await expect(banner).toBeVisible();
    await banner.locator('[data-consent="reject"]').click();
    await expect(banner).toBeHidden();
    await page.reload();
    await expect(page.locator('#consent')).toBeHidden();
    await page.locator('.consent-open').first().click();
    await expect(page.locator('#consent')).toBeVisible();
  });

  test('the eFaktura block opens the app without any sign-up', async ({ page }) => {
    const requests = [];
    page.on('request', (request) => { if (!request.url().startsWith(ORIGIN)) requests.push(request.url()); });
    await page.goto(`${ORIGIN}/sk/#efaktura`);
    await expect(page.locator('form')).toHaveCount(0);
    const start = page.locator('#efaktura #start');
    await expect(start.locator('ol.start-steps li')).toHaveCount(3);
    const button = start.locator('a.btn.primary');
    await expect(button).toHaveAttribute('href', '../app/');
    await button.click();
    await expect(page).toHaveURL(`${ORIGIN}/app/`);
    expect(requests.filter(u => u.includes('invoice-api'))).toEqual([]);
  });
});
