// Moving over from another invoicing program (test plan § 11.3, scenario
// 17): the issued invoices exported from iDoklad are read, the preview
// tells what comes in and what is skipped and why, the import adds the
// documents with their payments and contacts, and the numbering of the
// series goes on after the highest imported number.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { seed, company, live, offline } from './support/seed.js';
import { fillLine, issue } from './support/editor.js';

const CSV = readFileSync(new URL('../fixtures/imports/idoklad-vydane-faktury.csv', import.meta.url));
const SERIES = { id: 'series-fv', name: 'iDoklad', kind: 'INVOICE', mask: 'FV{YYYY}{N:3}', vsMask: null, reset: 'YEARLY', isDefault: true, counters: {} };

test('iDoklad invoices come in with a report and the numbering goes on', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.setFixedTime(new Date('2025-12-10T10:00:00+01:00'));
  await offline(page);
  await seed(page, { company: company({ series: [SERIES] }) }, { hash: '#/exim/import' });

  await page.selectOption('#exim-import-program', 'idoklad');
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#exim-import-choose').click();
  await (await chooser).setFiles({ name: 'vydane-faktury.csv', mimeType: 'text/csv', buffer: CSV });
  const counts = page.locator('#exim-import-counts');
  await expect(counts).toContainText('3');
  await expect(page.locator('.exim-issues')).toBeVisible();
  await page.locator('#exim-import-apply').click();
  await page.locator('.modal-content').getByRole('button', { name: 'Importovať' }).click();
  await expect(page.locator('.toast', { hasText: 'Import je hotový' })).toBeVisible({ timeout: 15_000 });

  const docs = (await live(page, 'documents')).filter(d => d.kind === 'INVOICE');
  expect(docs.map(d => d.number).sort()).toEqual(['FV2025001', 'FV2025002', 'FV2025003']);
  const paid = docs.find(d => d.number === 'FV2025001');
  expect(paid.payments.map(p => [p.date, Number(p.amount)])).toEqual([['2025-11-20', 1230]]);
  expect((await live(page, 'contacts')).map(c => c.name).sort()).toEqual(['Malý zákazník', 'Odběratel Praha s.r.o.']);

  await page.goto('./#/invoices/new');
  await page.locator('#editor-contact').fill('Malý');
  await page.locator('.editor-party .ac-item').first().click();
  await fillLine(page, { name: 'Ďalšia faktúra', qty: '1', price: '10' });
  expect(await issue(page)).toBe('FV2025004');
});
