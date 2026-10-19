// The P0 sales scenarios of the test plan (§ 11.3, scenarios 2 to 4) on
// the three viewports: an invoice with two VAT rates, a line discount and
// a document discount has the same totals on the screen, in the PDF and in
// the UBL; a partial credit note leaves the invoice partly corrected; a
// paid proforma gets its tax document for the received payment, and the
// final invoice deducts the advance.
import { test, expect } from '@playwright/test';
import { buildUbl, computeTotals } from '@we-invoice/core';
import { seed, company, contact, invoice, live, offline } from './support/seed.js';
import { fillLine, issue } from './support/editor.js';
import { pdfText } from './support/pdf-text.js';

test.describe.configure({ timeout: 90_000 });

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-18T10:00:00+02:00'));
  await offline(page);
});

const amount = (s) => s.replace('.', ',');

test('two rates, a line and a document discount: screen, PDF and UBL agree', async ({ page }) => {
  await seed(page, { company: company(), contacts: [contact()] }, { hash: '#/invoices/new?contact=e2e-contact-1' });
  await fillLine(page, { name: 'Montáž', qty: '2', price: '100' });
  await page.locator('.line-item').first().getByLabel('Zľava %').fill('10');
  await page.locator('.line-item').first().getByLabel('Zľava %').press('Tab');
  await page.locator('#editor-add-line').click();
  await fillLine(page, { name: 'Ubytovanie', qty: '1', price: '50', index: 1 });
  await page.locator('.line-item').nth(1).getByLabel('DPH', { exact: true }).selectOption({ label: '19 %' });
  await page.locator('.doc-discount input[aria-label="Výška zľavy"]').fill('10');
  await page.locator('.doc-discount input[aria-label="Výška zľavy"]').press('Tab');

  // 180.00 at 23 % and 50.00 at 19 %, less 10 % on the document.
  await expect(page.locator('.totals-payable')).toContainText('252,81');
  const number = await issue(page);

  const doc = (await live(page, 'documents')).find(d => d.number === number);
  const totals = computeTotals(doc);
  expect(totals).toMatchObject({ net: '207.00', vat: '45.81', gross: '252.81' });
  expect(totals.breakdown.map(b => [b.rate, b.base, b.vat])).toEqual([['23', '162.00', '37.26'], ['19', '45.00', '8.55']]);

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#detail-pdf').click()]);
  const text = await pdfText(await download.path());
  for (const value of ['252,81', '207,00', '45,81', '162,00', '37,26', '8,55']) expect(text).toContain(value);

  const ubl = buildUbl(doc, company());
  expect(ubl).toContain(`<cbc:TaxExclusiveAmount currencyID="EUR">${totals.net}</cbc:TaxExclusiveAmount>`);
  expect(ubl).toContain(`<cbc:PayableAmount currencyID="EUR">${totals.payable}</cbc:PayableAmount>`);
  expect(ubl).toContain('<cbc:ChargeIndicator>false</cbc:ChargeIndicator>');
  expect(amount(totals.payable)).toBe('252,81');
});

test('a partial credit note corrects part of the invoice', async ({ page }) => {
  const original = invoice({ number: 'FA20260001', issueDate: '2026-10-10', taxDate: '2026-10-10', dueDate: '2026-10-24' });
  await seed(page, { company: company(), contacts: [contact()], documents: [original] }, { hash: `#/invoices/${original.id}` });
  await page.locator('.more-actions > summary').click();
  await page.locator('[data-convert="CREDIT_NOTE"]').click();
  await page.locator('#ask-text').fill('Vrátené 4 hodiny');
  await page.locator('.modal-content').getByRole('button', { name: 'Vytvoriť' }).click();
  await expect(page).toHaveURL(/#\/credit-notes\/[^/]+\/edit/);
  const qty = page.locator('.line-item').first().getByLabel('Množstvo');
  await qty.fill('-4');
  await qty.press('Tab');
  await expect(page.locator('.totals-payable')).toContainText('-246,00');
  const number = await issue(page);
  expect(number).toMatch(/^DB/);
  await expect(page.locator('.detail-links')).toContainText('FA20260001');

  const docs = await live(page, 'documents');
  const note = docs.find(d => d.number === number);
  expect(computeTotals(note)).toMatchObject({ net: '-200.00', vat: '-46.00', gross: '-246.00' });
  expect(note.links).toEqual(expect.arrayContaining([expect.objectContaining({ docId: original.id })]));
  await page.goto(`./#/invoices/${original.id}`);
  await expect(page.locator('.detail-links')).toContainText(number);
  // The invoice itself stays issued and due in full until it is paid.
  await expect(page.locator('.status-badge').first()).toHaveText('Vystavená');
});

test('proforma, payment, tax document for the payment, final invoice', async ({ page }) => {
  await seed(page, { company: company(), contacts: [contact()] }, { hash: '#/proformas/new?contact=e2e-contact-1' });
  await fillLine(page, { name: 'Záloha na dielo', qty: '1', price: '1000' });
  const proforma = await issue(page);
  expect(proforma).toMatch(/^ZF/);
  await page.locator('#detail-add-payment').click();
  await page.locator('.modal-content').getByRole('button', { name: 'Zaznamenať úhradu' }).click();
  await expect(page.locator('.status-badge').first()).toHaveText('Uhradená');

  await page.locator('.more-actions > summary').click();
  await page.locator('[data-convert="ADVANCE_TAX_DOC"]').click();
  await expect(page).toHaveURL(/\/edit/);
  const advance = await issue(page);
  expect(advance).toMatch(/^DD/);
  await expect(page.locator('.detail-links')).toContainText(proforma);

  await page.goto('./#/proformas');
  await page.locator('.data-table .row, .data-table .list-card', { hasText: proforma }).first().click();
  await page.locator('.more-actions > summary').click();
  await page.locator('[data-convert="INVOICE"]').click();
  await expect(page.locator('.editor-advances')).toContainText(/ZF|DD/);
  await expect(page.locator('.totals-payable')).toContainText('0,00');
  const final = await issue(page);
  expect(final).toMatch(/^FA/);

  const docs = await live(page, 'documents');
  const finalDoc = docs.find(d => d.number === final);
  expect(computeTotals(finalDoc)).toMatchObject({ gross: '1230.00', payable: '0.00' });
  // The VAT of the advance was declared on the tax document: the final
  // invoice carries it as already paid, not twice.
  const taxDoc = docs.find(d => d.number === advance);
  expect(computeTotals(taxDoc)).toMatchObject({ net: '1000.00', vat: '230.00' });
});
