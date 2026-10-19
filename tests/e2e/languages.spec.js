// Every interface language and every print language (test plan § 11.3,
// scenario 11): the language chosen in Settings changes the page language
// and the menu, no screen shows a raw dictionary key, and an invoice
// prints in Slovak, Czech, English and German with its own labels and no
// key left over. Missing interface texts fall back to English, never to
// the key.
import { test, expect } from '@playwright/test';
import { seed, company, contact, invoice, offline } from './support/seed.js';
import { pdfText } from './support/pdf-text.js';

test.describe.configure({ timeout: 120_000 });

const LANGUAGES = { sk: 'Faktúry', en: 'Invoices', cs: 'Faktury', de: 'Rechnungen', ru: null, uk: null };
const SCREENS = ['#/dashboard', '#/invoices', '#/contacts', '#/bank', '#/vat-records', '#/cash-journal', '#/reports', '#/settings/interface'];
// A dictionary key such as "documents.action.copy" (not "s.r.o.").
const KEY = /\b[a-z]{2,}[a-zA-Z]*(?:\.[a-z][a-zA-Z]+){2,}\b/;
const PRINT = { sk: ['Faktúra', '615,00'], cs: ['Faktura', '615,00'], en: ['Invoice', '615.00'], de: ['Rechnung', '615,00'] };

test('the interface in all six languages has no raw keys', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the texts are the same on phones');
  await offline(page);
  await seed(page, { company: company(), contacts: [contact()], documents: [invoice()] }, { hash: '#/settings/interface' });
  for (const [lang, menu] of Object.entries(LANGUAGES)) {
    await page.goto('./#/settings/interface');
    await page.selectOption('#settings-language', lang);
    await expect(page.locator('html')).toHaveAttribute('lang', lang);
    if (menu) await expect(page.locator('.sidebar .nav-item[href="#/invoices"]')).toHaveText(menu);
    const problems = [];
    for (const hash of SCREENS) {
      await page.goto(`./${hash}`);
      await expect(page.locator('main#main h1').first()).toBeVisible();
      await page.waitForTimeout(300);
      const text = await page.locator('body').innerText();
      const key = text.match(KEY);
      if (key) problems.push(`${lang} ${hash}: ${key[0]}`);
    }
    expect(problems).toEqual([]);
  }
});

for (const [lang, [title, total]] of Object.entries(PRINT)) {
  test(`an invoice prints in ${lang}`, async ({ page, isMobile }) => {
    test.skip(isMobile, 'the PDF is the same on phones');
    await offline(page);
    const doc = invoice({ language: lang });
    await seed(page, { company: company(), contacts: [contact()], documents: [doc] }, { hash: `#/invoices/${doc.id}` });
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#detail-pdf').click()]);
    const text = await pdfText(await download.path());
    expect(text).toContain(`${title} FA20260001`);
    expect(text).toContain(total);
    expect(text.match(/\b(?:title|label|pdf|print)\.[a-zA-Z.]+/)).toBeNull();
  });
}
