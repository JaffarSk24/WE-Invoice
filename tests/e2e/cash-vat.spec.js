// A cash voucher under reverse charge end to end (acceptance A15): a VAT
// payer pays a supplier in cash for a supply under § 69 ods. 12, picks
// "Prenesenie daňovej povinnosti" in the výdavkový pokladničný doklad, is
// stopped until the supplier's IČ DPH is given, and the voucher then shows
// in the Evidencia DPH of its month as a self-assessed purchase.
import { test, expect } from '@playwright/test';
import { seed, company, readData, offline, NOW } from './support/seed.js';

const BOOK = { id: 'e2e-cash-1', createdAt: NOW, updatedAt: NOW, name: 'Hlavná pokladnica', currency: 'EUR', openingBalance: '1000', allowNegative: false, seriesInId: 'ser-ppd', seriesOutId: 'ser-vpd', kind: 'CASH' };
const SERIES = [
  { id: 'ser-ppd', name: 'PPD', kind: 'CASH_IN', mask: 'PPD{YYYY}{N:4}', reset: 'YEARLY', isDefault: true, counters: {} },
  { id: 'ser-vpd', name: 'VPD', kind: 'CASH_OUT', mask: 'VPD{YYYY}{N:4}', reset: 'YEARLY', isDefault: true, counters: {} }
];

test('a reverse charge cash expense needs the IČ DPH and lands in the VAT records', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+02:00'));
  await offline(page);
  await seed(page, { company: company({ series: SERIES }), cashBooks: [BOOK] }, { hash: '#/cash' });
  await expect(page.locator('main#main h1')).toHaveText('Pokladňa');

  await page.locator('.view-actions .btn', { hasText: 'Výdavkový doklad' }).click();
  const dialog = page.locator('.modal-content');
  await dialog.getByLabel('Dátum').fill('2026-09-15');
  await dialog.getByLabel('Suma').fill('300');
  await dialog.getByLabel('Účel').fill('Stavebné práce');
  await dialog.getByLabel('Vyplatené komu').fill('Murár s.r.o.');
  await dialog.getByLabel('DPH', { exact: true }).selectOption('AE');
  await expect(dialog.locator('.voucher-vat-hint')).toContainText('§ 69 ods. 12');
  await dialog.locator('.modal-actions [data-primary]').click();
  await expect(dialog).toContainText('Pri prenesení daňovej povinnosti zadajte IČ DPH partnera.');

  await dialog.getByLabel('IČ DPH partnera').fill('SK2021234567');
  await dialog.locator('.modal-actions [data-primary]').click();
  await expect(page.locator('.toast', { hasText: 'VPD20260001' })).toBeVisible();

  const data = await readData(page);
  const voucher = data.documents.find(d => d.number === 'VPD20260001');
  expect(voucher.lines[0]).toMatchObject({ vatCategory: 'AE', vatRate: null, exemptionReasonCode: 'VATEX-EU-AE' });
  expect(voucher.seller).toMatchObject({ name: 'Murár s.r.o.', icDph: 'SK2021234567' });

  await page.goto('./#/vat-records');
  const main = page.locator('main#main');
  await expect(main).toContainText('69,00');
  await page.getByRole('tab', { name: 'Prijaté doklady' }).click();
  await expect(main).toContainText('VPD20260001');
  await expect(main).toContainText('Prenesenie daňovej povinnosti');
  await expect(main).toContainText('SK2021234567');
});
