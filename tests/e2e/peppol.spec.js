// The eFaktúra wizard end to end with the gateway and the provider mocked:
// a company from the "My company" wizard opens Settings > eFaktúra, picks
// Verteco, tests the connection through the gateway proxy, checks the
// Peppol registration, and the two e-invoice screens open. Without Google
// Drive the key cannot be kept (secrets are sealed with the Drive data
// key), which the wizard says.
import { test, expect } from '@playwright/test';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
const LOOKUP = {
  name: 'Alfa Stavby, s. r. o.', ico: '12345679', dic: '2020000004', icDph: 'SK2020000004', legalForm: 'SRO', legalFormText: 'Spoločnosť s ručením obmedzeným',
  registerEntry: 'OR OS Bratislava I, oddiel Sro, vložka 1/B', country: 'SK',
  address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' }, source: 'RPO', checkedAt: '2026-10-18T10:00:00Z'
};

function json(route, status, body) {
  return route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
}

async function mockGateway(page, seen) {
  await page.route('**/v1/company/sk/**', route => json(route, 200, LOOKUP));
  await page.route('**/v1/peppol/lookup/0245/**', route => json(route, 200, { registered: true, documentTypes: [], checkedAt: '2027-01-02T10:00:00Z' }));
  await page.route('**/v1/proxy/peppol/**', route => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(request.url()).pathname.replace(/^.*\/v1\/proxy\/peppol\//, '');
    seen.push({ path, auth: request.headers()['x-upstream-authorization'] || null });
    if (path === 'verteco/auth/token') {
      const body = JSON.parse(request.postData());
      return body.client_secret === 'vpt_e2e' ? json(route, 200, { access_token: 'jwt-e2e', expires_in: 900 }) : json(route, 401, { error: { code: 'INVALID_CLIENT' } });
    }
    if (path === 'verteco/document/receive') return json(route, 200, { documents: [], nextPageToken: null });
    return json(route, 404, { error: { code: 'NOT_FOUND' } });
  });
}

async function createCompany(page) {
  const next = () => page.locator('#ob-next').click();
  await page.goto('./#/onboarding');
  await next();
  await page.locator('label.radio-card', { hasText: 'Vyskúšať bez prihlásenia' }).click();
  await next();
  await page.fill('#ob-ico', '12345679');
  await page.locator('#ob-lookup').click();
  await expect(page.locator('#ob-name')).toHaveValue('Alfa Stavby, s. r. o.');
  await next();
  await next();
  await next();
  await page.fill('#ob-iban', 'SK31 1200 0000 1987 4263 7541');
  await page.locator('#ob-iban').blur();
  await next();
  await next();
  await next();
  await page.locator('#ob-first-invoice').click();
  await expect(page.locator('#company-switcher option:checked')).toHaveText('Alfa Stavby, s. r. o.');
}

test('the eFaktúra wizard connects a provider through the gateway', async ({ page }) => {
  const seen = [];
  await mockGateway(page, seen);
  await createCompany(page);
  await page.goto('./#/settings/peppol');
  const wizard = page.locator('.peppol-step');
  await expect(wizard.first()).toBeVisible();
  await expect(page.locator('[data-provider="verteco"] input')).toBeChecked();
  await expect(page.locator('[data-step="connect"]')).toContainText('0245:2020000004');

  await page.fill('#peppol-cred-clientId', 'client');
  await page.fill('#peppol-cred-clientSecret', 'wrong');
  await page.locator('[data-action="test-connection"]').click();
  await expect(page.locator('[data-step="connect"] .peppol-result')).toHaveClass(/is-error/);
  await expect(page.locator('[data-step="connect"] .peppol-result')).toContainText('kľúč');

  await page.fill('#peppol-cred-clientSecret', 'vpt_e2e');
  await page.locator('[data-action="test-connection"]').click();
  await expect(page.locator('[data-step="connect"] .peppol-result')).toContainText('Pripojenie funguje.');
  await expect(page.locator('[data-step="connect"] .peppol-result')).toContainText('Google Disku');
  expect(seen.some(s => s.path === 'verteco/document/receive' && s.auth === 'Bearer jwt-e2e')).toBe(true);

  await page.locator('[data-action="lookup"]').click();
  await expect(page.locator('[data-step="lookup"] .peppol-result')).toHaveClass(/is-ok/);

  await page.goto('./#/efaktury-out');
  await expect(page.locator('main#main h1')).toContainText('Beta');
  await expect(page.locator('.peppol-filter .segment')).toHaveCount(4);
  await page.goto('./#/efaktury-in');
  await expect(page.locator('[data-action="receive-now"]')).toBeVisible();
});

test('the e-invoice screens have no serious axe issues and stay read-only in demo mode', async ({ page }) => {
  const AxeBuilder = (await import('@axe-core/playwright')).default;
  await page.addInitScript(() => localStorage.setItem('we-invoice-prefs', JSON.stringify({ theme: 'dark', demo: true, onboardingDone: true })));
  for (const hash of ['#/settings/peppol', '#/efaktury-out', '#/efaktury-in']) {
    await page.goto(`./${hash}`);
    await expect(page.locator('main#main h1, main#main h2').first()).toBeVisible();
    await expect(page.locator('.peppol-step, .peppol-list').first()).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
      .map(v => `${hash} ${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(', ')}`);
    expect(bad).toEqual([]);
  }
  await page.locator('[data-action="receive-now"]').click();
  await expect(page.locator('.toast', { hasText: 'režime ukážky' })).toBeVisible();
});
