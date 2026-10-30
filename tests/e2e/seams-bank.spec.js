// Bank to documents to reports (test plan § 11.3, scenario 13, and the
// WP-BANK / WP-SALES / WP-REPORTS seam): a CAMT.053 statement is imported,
// the matching proposes the open invoices by variable symbol, the
// confirmed payments change their statuses, and the aging report of
// receivables shows only what is still due.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { seed, company, contact, invoice, live, offline } from './support/seed.js';

const STATEMENT = readFileSync(new URL('../fixtures/bank/camt053.xml', import.meta.url));

const big = invoice({
  number: 'FA20260001', dueDate: '2026-10-04',
  lines: [{ id: 'l1', kind: 'ITEM', name: 'Dielo', qty: '1', unit: { code: 'C62', label: 'ks' }, unitPrice: '1000', priceType: 'NET', vatCategory: 'S', vatRate: '23' }],
  totals: { lineNet: '1000.00', allowances: '0.00', charges: '0.00', prepaid: '0.00', rounding: '0.00', vatEur: null, net: '1000.00', vat: '230.00', gross: '1230.00', payable: '1230.00', breakdown: [{ category: 'S', rate: '23', base: '1000.00', vat: '230.00' }] }
});
const small = invoice({ number: 'FA20260002', dueDate: '2026-10-04' });

test('a CAMT.053 statement pays the invoices and the aging report follows', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2026-10-20T10:00:00+02:00'));
  await offline(page);
  await seed(page, { company: company(), contacts: [contact()], documents: [big, small] }, {
    hash: '#/reports', prefs: { reportsPeriod: { preset: 'all', granularity: 'month' } }
  });

  const aging = async () => {
    await page.goto('./#/reports');
    await page.locator('.report-tabs [role="tab"]', { hasText: 'Pohľadávky a záväzky' }).click();
    return page.locator('.report-tabs [role="tabpanel"]:not([hidden])');
  };
  let panel = await aging();
  await expect(panel).toContainText('FA20260001');
  await expect(panel).toContainText('FA20260002');
  await expect(panel.locator('.report-cards').first()).toContainText('1 845,00');

  await page.goto('./#/bank');
  await page.locator('.view-actions .btn-primary').click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('.file-drop [data-action="choose"]').click();
  await (await chooser).setFiles({ name: 'vypis.xml', mimeType: 'application/xml', buffer: STATEMENT });
  await expect(page.locator('.import-body')).toContainText('nové');
  await page.locator('.modal-actions .btn-primary').click();

  const match = page.locator('.modal-content', { hasText: 'Párovanie platieb' });
  await expect(match).toBeVisible();
  const rows = match.locator('.match-row');
  await expect(rows.filter({ hasText: 'FA20260001' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'FA20260002' })).toHaveCount(1);
  // The sure match is ticked; the part payment waits for the user.
  await expect(rows.filter({ hasText: 'FA20260001' }).locator('.match-check')).toBeChecked();
  const part = rows.filter({ hasText: 'FA20260002' }).locator('.match-check');
  await expect(part).not.toBeChecked();
  await part.check();
  await expect(match.locator('.modal-actions .btn-primary')).toContainText('2');
  await match.locator('.modal-actions .btn-primary').click();

  await expect.poll(async () => (await live(page, 'documents')).map(d => [d.number, d.payments.map(p => [p.amount, p.source])]).sort()).toEqual([
    ['FA20260001', [['1230.00', 'BANK_IMPORT']]], ['FA20260002', [['400.00', 'BANK_IMPORT']]]
  ]);
  await page.goto(`./#/invoices/${big.id}`);
  await expect(page.locator('.status-badge').first()).toHaveText('Uhradená');
  // Part paid but past its due date: still overdue.
  await page.goto(`./#/invoices/${small.id}`);
  await expect(page.locator('.status-badge').first()).toHaveText('Po splatnosti');

  panel = await aging();
  await expect(panel).not.toContainText('FA20260001');
  await expect(panel).toContainText('FA20260002');
  // 615.00 - 400.00 still due.
  await expect(panel.locator('.report-cards').first()).toContainText('215,00');
});
