// A cash voucher under reverse charge end to end (acceptance A15): a VAT
// payer pays a supplier in cash for a supply under § 69 ods. 12, picks
// "Prenesenie daňovej povinnosti" in the výdavkový pokladničný doklad, is
// stopped until the supplier's IČ DPH is given, and the voucher then shows
// in the Evidencia DPH of its month as a self-assessed purchase. A company
// that uses eKasa marks its cash sales as recorded in eKasa by default: they
// are listed apart and not added; with the mark cleared next to eKasa
// turnover of the same day the records warn about a double count.
import { test, expect } from '@playwright/test';
import { seed, company, invoice, readData, offline, NOW } from './support/seed.js';

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

async function newReceipt(page, { amount, purpose, keepMark }) {
  await page.locator('.view-actions .btn', { hasText: 'Príjmový doklad' }).click();
  const dialog = page.locator('.modal-content');
  await dialog.getByLabel('Dátum').fill('2026-09-15');
  await dialog.getByLabel('Suma').fill(amount);
  await dialog.getByLabel('Účel').fill(purpose);
  await dialog.getByLabel('DPH', { exact: true }).selectOption('S:23');
  const mark = dialog.getByLabel('Predaj evidovaný v eKasa');
  await expect(mark).toBeChecked();
  if (!keepMark) await mark.uncheck();
  await dialog.locator('.modal-actions [data-primary]').click();
  await expect(dialog).toHaveCount(0);
}

test('a cash sale recorded in eKasa is listed apart; one counted next to eKasa turnover is a warning', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+02:00'));
  await offline(page);
  const turnover = invoice({ number: 'EK-0915', kind: 'SALES_RECEIPT', issueDate: '2026-09-15', taxDate: '2026-09-15', dueDate: null, contactId: null, buyer: { name: '' } });
  await seed(page, { company: company({ series: SERIES }), cashBooks: [BOOK], documents: [turnover] }, { hash: '#/cash' });
  await newReceipt(page, { amount: '123', purpose: 'Predaj tovaru', keepMark: true });

  await page.goto('./#/vat-records');
  const main = page.locator('main#main');
  const covered = main.locator('.tax-ekasa-covered');
  await expect(covered).toContainText('Predaje evidované v eKasa (nezapočítané)');
  await expect(covered).toContainText('PPD20260001');
  await expect(main.locator('.tax-tile-value').first()).toHaveText(/115,00/);
  await expect(main.locator('.tax-problem')).toHaveCount(0);

  await page.goto('./#/cash');
  await newReceipt(page, { amount: '61,50', purpose: 'Predaj mimo eKasa', keepMark: false });
  const data = await readData(page);
  expect(data.documents.filter(d => d.kind === 'CASH_IN').map(d => [d.number, d.ekasaSale])).toEqual([['PPD20260001', true], ['PPD20260002', false]]);

  await page.goto('./#/vat-records');
  await expect(main.locator('.tax-tile-value').first()).toHaveText(/126,50/);
  await expect(main.locator('.tax-problem.is-warning')).toContainText('Pokladničný doklad PPD20260002 sa započítava samostatne');
});

