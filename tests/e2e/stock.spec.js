// Stock end to end: a company is created through the wizard (register
// lookup mocked), goods come in on a receipt with a new stock item, one
// piece is sold on the quick sale for cash, the VRP2 data is shown and the
// stock level drops from 10 to 9.
import { test, expect } from '@playwright/test';

const LOOKUP = {
  name: 'Sklad Test, s. r. o.', ico: '12345679', dic: '2020000004', icDph: 'SK2020000004', legalForm: 'SRO', legalFormText: 'Spoločnosť s ručením obmedzeným',
  registerEntry: 'OR OS Bratislava I, oddiel Sro, vložka 1/B', country: 'SK',
  address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' }, source: 'RPO', checkedAt: '2026-10-18T10:00:00Z'
};
const ITEM = 'Farba biela 5 l';

async function createCompany(page) {
  await page.route('**/v1/company/sk/**', route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(LOOKUP)
  }));
  await page.goto('./#/onboarding');
  const next = () => page.locator('#ob-next').click();
  await next();
  await page.locator('label.radio-card', { hasText: 'Vyskúšať bez prihlásenia' }).click();
  await next();
  await page.fill('#ob-ico', '12 345 679');
  await page.locator('#ob-lookup').click();
  await expect(page.locator('#ob-name')).toHaveValue(LOOKUP.name);
  await next();
  await next();
  await next();
  await page.fill('#ob-iban', 'SK31 1200 0000 1987 4263 7541');
  await page.locator('#ob-iban').blur();
  await next();
  await next();
  await next();
  await page.locator('#ob-first-invoice').click();
  await expect(page.locator('#company-switcher option:checked')).toHaveText(LOOKUP.name);
}

const topModal = (page) => page.locator('.modal-content[role="dialog"]').last();

test('receipt, quick sale and the stock level drops', async ({ page }) => {
  // The wizard alone takes most of the default budget on the phone profiles.
  test.setTimeout(90_000);
  await createCompany(page);

  await page.goto('./#/stock');
  await expect(page.locator('main#main h1')).toHaveText('Sklad');
  await page.locator('#stock-receipt').click();
  await expect(topModal(page).locator('h3')).toHaveText('Príjemka');
  await page.locator('#stock-move-new-item').click();
  await page.fill('#stock-new-item-name', ITEM);
  await topModal(page).getByRole('button', { name: 'Uložiť' }).click();
  await expect(page.locator('#stock-move-item option:checked')).toHaveText(ITEM);
  await page.fill('#stock-move-qty', '10');
  await page.fill('#stock-move-cost', '6');
  await topModal(page).getByRole('button', { name: 'Uložiť' }).click();
  await expect(page.locator('.modal-content')).toHaveCount(0);
  const row = page.locator('.data-table .row, .data-table .list-card', { hasText: ITEM });
  await expect(row).toContainText('10');

  await page.goto('./#/quick-sale');
  await expect(page.locator('main#main h1')).toHaveText('Predajka');
  await page.locator('.sale-item', { hasText: ITEM }).click();
  await expect(page.locator('.sale-line')).toHaveCount(1);
  await page.locator('.segment[data-method="CASH"]').click();
  await page.locator('#sale-sell').click();
  await expect(page.locator('#stock-vrp-number')).toHaveText(/^PR\d{4}0001$/);
  await topModal(page).locator('.modal-actions button', { hasText: 'Zavrieť' }).click();
  await expect(page.locator('.sale-line')).toHaveCount(0);

  await page.goto('./#/stock');
  await expect(row).toContainText('9');
  await expect(row).not.toContainText('10');
  await page.goto('./#/stock/moves');
  await expect(page.locator('.data-table')).toContainText('Výdaj');
});

test('a reverse-charge line on the quick sale needs the buyer IČ DPH', async ({ page }) => {
  test.setTimeout(90_000);
  await createCompany(page);

  await page.goto('./#/stock');
  await page.locator('#stock-receipt').click();
  await page.locator('#stock-move-new-item').click();
  await page.fill('#stock-new-item-name', 'Mobilný telefón');
  await topModal(page).locator('.field', { hasText: 'Predajná cena bez DPH' }).locator('input').fill('100');
  await topModal(page).getByRole('button', { name: 'Uložiť' }).click();
  await page.fill('#stock-move-qty', '5');
  await topModal(page).getByRole('button', { name: 'Uložiť' }).click();
  await expect(page.locator('.modal-content')).toHaveCount(0);

  await page.goto('./#/quick-sale');
  await page.locator('.sale-item', { hasText: 'Mobilný telefón' }).click();
  await expect(page.locator('#sale-buyer')).toBeHidden();
  await page.locator('select.sale-vat').selectOption('AE');
  await expect(page.locator('#sale-buyer')).toBeVisible();
  await expect(page.locator('#sale-payable')).toContainText('100,00');
  await page.locator('#sale-sell').click();
  await expect(page.locator('#sale-buyer-name-error')).toBeVisible();
  await expect(page.locator('#stock-vrp')).toHaveCount(0);

  await page.fill('#sale-buyer-name', 'Gama, s. r. o.');
  await page.fill('#sale-buyer-icdph', 'CZ12345679');
  await page.locator('#sale-sell').click();
  await expect(page.locator('#sale-buyer-icdph-error')).toContainText('SK');
  await page.fill('#sale-buyer-icdph', 'SK2021000003');
  await page.locator('#sale-sell').click();
  await expect(page.locator('#stock-vrp-buyer')).toHaveText('Gama, s. r. o., SK2021000003');
  await expect(page.locator('#stock-vrp td[data-category="AE"]').first()).toHaveText('Prenesenie daňovej povinnosti');
  await expect(page.locator('#stock-vrp-reverse-charge')).toBeVisible();
  await expect(page.locator('#stock-vrp-payable')).toContainText('100,00');
});
