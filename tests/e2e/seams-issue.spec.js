// Seams between the packages around one issued invoice: the editor issues
// it with a stock item (WP-SALES), the stock level drops (WP-STOCK), the
// VAT records of the month list it (WP-TAX), and after the payment the
// cash book shows the income (WP-LEDGER). The price comes from the price
// level of the client (priceFor of the core).
import { test, expect } from '@playwright/test';
import { seed, company, contact, item, live, offline } from './support/seed.js';

test.describe.configure({ timeout: 90_000 });

const WAREHOUSE = { id: 'e2e-wh', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', name: 'Hlavný sklad', code: 'HS', isDefault: true };
const LEVEL = { id: 'e2e-level-vo', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', name: 'Veľkoobchod', discountPct: '10' };
const RECEIPT = {
  id: 'e2e-move-in', createdAt: '2026-10-01T08:00:00.000Z', updatedAt: '2026-10-01T08:00:00.000Z', kind: 'RECEIPT', date: '2026-10-01',
  warehouseId: WAREHOUSE.id, targetWarehouseId: null, itemId: 'e2e-item-1', qty: '10', unitCost: '12.00', docId: null, note: null
};

async function pickItem(page, text) {
  const name = page.locator('.line-item').first().getByLabel('Názov', { exact: true });
  await name.fill(text);
  await page.locator('.line-item .ac-item').first().click();
}

test('an issued invoice moves the stock, lands in the VAT records and, once paid, in the cash book', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+02:00'));
  await offline(page);
  await seed(page, {
    company: company(),
    contacts: [contact({ priceLevelId: LEVEL.id })],
    items: [item({ stockTracked: true })],
    priceLevels: [LEVEL],
    warehouses: [WAREHOUSE],
    stockMoves: [RECEIPT]
  }, { hash: '#/invoices/new?contact=e2e-contact-1' });

  await expect(page.locator('.party-summary strong')).toHaveText('Beta Obchod, s. r. o.');
  await pickItem(page, 'Farba');
  const line = page.locator('.line-item').first();
  // The list price is 20.00; the client's level takes 10 % off.
  await expect(line.getByLabel('Cena bez DPH').first()).toHaveValue('18');
  await line.getByLabel('Množstvo').fill('3');
  await line.getByLabel('Množstvo').press('Tab');
  await expect(page.locator('.totals-payable')).toContainText('66,42');

  await page.locator('#editor-issue').click();
  await expect(page.locator('main h1')).toHaveText(/Faktúra FA\d{8}/);

  // Stock: 10 received, 3 sold.
  await expect.poll(async () => (await live(page, 'stockMoves')).filter(m => m.kind !== 'RECEIPT').map(m => [m.kind, m.qty])).toEqual([['ISSUE', '3']]);
  await page.goto('./#/stock');
  await expect(page.locator('.data-table .row, .data-table .list-card', { hasText: 'Farba biela 5 l' })).toContainText('7');

  // VAT records of October list the invoice with its base and VAT.
  // The screen opens on the month to file (September); October is next.
  await page.goto('./#/vat-records');
  await expect(page.locator('.tax-period-name')).toContainText('september 2026');
  await page.getByRole('button', { name: 'Nasledujúce obdobie' }).click();
  await expect(page.locator('.tax-period-name')).toContainText('október 2026');
  await expect(page.locator('main#main')).toContainText('Beta Obchod, s. r. o.');
  await expect(page.locator('main#main')).toContainText('54,00');
  await expect(page.locator('main#main')).toContainText('12,42');

  // Not paid yet: no income in the cash book.
  const number = (await live(page, 'documents')).find(d => d.kind === 'INVOICE').number;
  await page.goto('./#/cash-journal');
  await expect(page.locator('main#main h1')).toHaveText('Peňažný denník');
  await expect(page.locator('main#main')).not.toContainText(number);

  await page.goto('./#/invoices');
  await page.locator('.data-table .row, .data-table .list-card', { hasText: number }).first().click();
  await page.locator('#detail-add-payment').click();
  await page.locator('.modal-content').getByRole('button', { name: 'Zaznamenať úhradu' }).click();
  await expect(page.locator('.status-badge').first()).toHaveText('Uhradená');

  await expect.poll(async () => (await live(page, 'ledgerEntries')).length).toBeGreaterThan(0);
  await page.goto('./#/cash-journal');
  await expect(page.locator('main#main')).toContainText(number);
  await expect(page.locator('main#main')).toContainText('66,42');
});
