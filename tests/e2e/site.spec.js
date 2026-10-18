// The landing page in a browser: the static files of site/ are served from
// a fake origin through route interception, the gateway is mocked. Covers
// the root redirect, the consent banner and the waitlist form.
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

  test('waitlist form validates, sends the contract body and shows the result', async ({ page }) => {
    let body = null;
    await page.route('https://invoice-api.whiteeagles.sk/v1/waitlist', (route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ status: 'pending' }) });
    });
    await page.goto(`${ORIGIN}/sk/#waitlist`);
    const form = page.locator('#waitlist-form');
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('.form-status')).toHaveClass(/bad/);
    expect(body).toBeNull();

    await form.locator('#wl-email').fill('jana@priklad.sk');
    await form.locator('input[name="interests"][value="efaktura-receive"]').check();
    await form.locator('input[name="vatPayer"][value="false"]').check();
    await form.locator('input[name="consent"]').check();
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('.form-status')).toHaveClass(/ok/);
    expect(body).toMatchObject({ email: 'jana@priklad.sk', lang: 'sk', consent: true, source: 'site', interests: ['efaktura-receive'], vatPayer: false, website: '' });
    expect(body.startedAt).toBeGreaterThan(0);
  });

  test('a rate-limited answer shows the error of the page language', async ({ page }) => {
    await page.route('https://invoice-api.whiteeagles.sk/v1/waitlist', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'slow down' } }) }));
    await page.goto(`${ORIGIN}/en/`);
    const form = page.locator('#waitlist-form');
    await form.locator('#wl-email').fill('a@b.co');
    await form.locator('input[name="consent"]').check();
    await form.locator('button[type="submit"]').click();
    const status = form.locator('.form-status');
    await expect(status).toHaveClass(/bad/);
    await expect(status).toHaveText(await form.getAttribute('data-msg-rate-limited'));
  });
});
