// Shared steps of the WP-CRM end-to-end tests: a company set up through
// the wizard with the register mocked, so the store holds a real company
// to write contacts, documents and templates to.
import { expect } from '@playwright/test';

export const COMPANY = {
  name: 'Alfa Stavby, s. r. o.', ico: '12345679', dic: '2020000004', icDph: 'SK2020000004', legalForm: 'SRO', legalFormText: 'Spoločnosť s ručením obmedzeným',
  registerEntry: 'OR OS Bratislava I, oddiel Sro, vložka 1/B', country: 'SK',
  address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' }, source: 'RPO', checkedAt: '2026-10-18T10:00:00Z'
};

export const CLIENT = {
  name: 'Beta Obchod, s. r. o.', ico: '36070947', dic: '2020000015', icDph: 'SK2020000015', country: 'SK',
  address: { street: 'Mlynská 5', city: 'Košice', zip: '040 01', country: 'SK' }, source: 'RPO', checkedAt: '2026-10-18T10:00:00Z'
};

const json = (body, status = 200) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

// Mocks the register, VIES and the FS lists of the gateway.
export async function mockGateway(page) {
  await page.route('**/v1/company/sk/**', route => {
    const url = route.request().url();
    if (url.includes('/search')) return route.fulfill(json({ results: [CLIENT] }));
    return route.fulfill(json(url.includes(CLIENT.ico) ? CLIENT : COMPANY));
  });
  await page.route('**/v1/vat/vies/**', route => route.fulfill(json({ valid: true, name: CLIENT.name, checkedAt: new Date().toISOString() })));
  await page.route('**/v1/vat/sk/**', route => route.fulfill(json({ status: 'OK', lists: [], checkedAt: new Date().toISOString() })));
}

const next = (page) => page.locator('#ob-next').click();

// Runs the "My company" wizard to its end.
export async function setUpCompany(page) {
  await mockGateway(page);
  await page.goto('./#/onboarding');
  await next(page);
  await page.locator('label.radio-card', { hasText: 'Vyskúšať bez prihlásenia' }).click();
  await next(page);
  await page.fill('#ob-ico', COMPANY.ico);
  await page.locator('#ob-lookup').click();
  await expect(page.locator('#ob-name')).toHaveValue(COMPANY.name);
  await next(page);
  await next(page);
  await next(page);
  await page.fill('#ob-iban', 'SK31 1200 0000 1987 4263 7541');
  await page.locator('#ob-iban').blur();
  await next(page);
  await next(page);
  await next(page);
  await page.locator('#ob-first-invoice').click();
  await expect(page.locator('#company-switcher option:checked')).toHaveText(COMPANY.name);
}
