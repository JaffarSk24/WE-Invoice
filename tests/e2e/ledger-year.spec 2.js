// A year of simple bookkeeping (test plan § 11.3, scenario 16): paid
// invoices and a paid received invoice become entries of the cash book
// (peňažný denník), the closing of the year shows both statements with
// the income and the expense, and the year is closed.
import { test, expect } from '@playwright/test';
import { seed, company, contact, invoice, live, offline } from './support/seed.js';

test.describe.configure({ timeout: 90_000 });

const pay = (date, amount, id) => ({ id, date, amount, currency: 'EUR', method: 'TRANSFER', source: 'MANUAL', bankTxId: null, cashBookId: null, ekasaReceiptId: null, ekasaOkp: null, note: null });
const sales = [
  invoice({ number: 'FA20260001', issueDate: '2026-03-02', taxDate: '2026-03-02', dueDate: '2026-03-16', payments: [pay('2026-03-10', '615.00', 'p1')] }),
  invoice({ number: 'FA20260002', issueDate: '2026-11-20', taxDate: '2026-11-20', dueDate: '2026-12-04', payments: [pay('2026-12-01', '615.00', 'p2')] }),
  // Paid only in the next year: no income of 2026.
  invoice({ number: 'FA20260003', issueDate: '2026-12-20', taxDate: '2026-12-20', dueDate: '2027-01-03', payments: [pay('2027-01-02', '615.00', 'p3')] })
];
const supplier = { name: 'Účtovníctvo Pro s.r.o.', ico: '51234564', dic: '2022334402', icDph: 'SK2022334402', vatPayer: true, address: { street: 'Mostová 2', city: 'Nitra', zip: '949 01', country: 'SK' } };
const received = {
  ...invoice({ number: 'PF2026105', issueDate: '2026-06-01', taxDate: '2026-06-01', dueDate: '2026-06-15', payments: [pay('2026-06-10', '221.40', 'p4')] }),
  id: 'e2e-received-1', kind: 'RECEIVED_INVOICE', status: 'PROCESSED', contactId: null, receivedDate: '2026-06-02', seller: supplier,
  buyer: { name: 'Biela Orlica s.r.o.', ico: '36123455', dic: '1020123402', icDph: 'SK1020123402', address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' } },
  expenseCategory: 'SERVICES',
  lines: [{ id: 'l1', kind: 'ITEM', name: 'Vedenie účtovníctva', qty: '1', unit: { code: 'C62', label: 'ks' }, unitPrice: '180', priceType: 'NET', vatCategory: 'S', vatRate: '23', accountingCategory: 'EXPENSE_TAX_SERVICES' }],
  totals: { lineNet: '180.00', allowances: '0.00', charges: '0.00', prepaid: '0.00', rounding: '0.00', vatEur: null, net: '180.00', vat: '41.40', gross: '221.40', payable: '221.40', breakdown: [{ category: 'S', rate: '23', base: '180.00', vat: '41.40' }] }
};

test('the cash book of a year, its statements and the closing', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-01-15T10:00:00+01:00'));
  await offline(page);
  await seed(page, { company: company(), contacts: [contact()], documents: [...sales, received] }, { hash: '#/cash-journal' });

  // The entries follow the payments in the background.
  await expect.poll(async () => (await live(page, 'ledgerEntries')).map(e => e.date).sort(), { timeout: 15_000 })
    .toEqual(['2026-03-10', '2026-06-10', '2026-12-01', '2027-01-02']);
  const main = page.locator('main#main');
  await expect(main.locator('h1')).toHaveText('Peňažný denník');
  await main.locator('select').first().selectOption('2026');
  for (const number of ['FA20260001', 'FA20260002', 'PF2026105']) await expect(main).toContainText(number);
  await expect(main).not.toContainText('FA20260003');

  await page.goto('./#/closing');
  await main.locator('select').first().selectOption('2026');
  const statements = main.locator('.ledger-statement');
  await expect(statements).toHaveCount(2);
  await expect(statements.first()).toContainText('Výkaz o príjmoch a výdavkoch');
  // Income of 2026: two invoices of 500.00 net; expense: 180.00 net.
  await expect(statements.first()).toContainText('1 000,00');
  await expect(statements.first()).toContainText('180,00');

  await main.locator('[data-action="close-year"]').click();
  await page.locator('.modal-content .modal-actions .btn-primary').click();
  await expect(page.locator('.toast', { hasText: 'Rok 2026 je uzavretý.' })).toBeVisible();
  await expect(main).toContainText('Rok bol uzavretý');
});
