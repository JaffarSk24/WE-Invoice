// The kontrolný výkaz of a month from real documents (test plan § 11.3,
// scenario 15): the golden example of March is put into the store, the
// screen shows its sections and checks, and the downloaded XML is the
// golden file, well-formed and, when the official XSD is at hand, valid.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { seed, company, offline } from './support/seed.js';
import { checkXml } from './support/xsd.js';

const dir = new URL('../fixtures/tax/01-monthly-domestic/', import.meta.url);
const input = JSON.parse(readFileSync(new URL('input.json', dir), 'utf8'));
const golden = readFileSync(new URL('kv.xml', dir), 'utf8');
const expected = JSON.parse(readFileSync(new URL('expected.json', dir), 'utf8'));

test('the KV of March: sections, checks and the XML', async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date(`${input.today}T10:00:00+02:00`));
  await offline(page);
  await seed(page, { company: company({ ...input.company, series: [], defaults: company().defaults }), documents: input.documents }, { hash: '#/kv' });
  await expect(page.locator('main#main h1')).toHaveText('Kontrolný výkaz');
  await expect(page.locator('.tax-period-name')).toContainText('marec 2026');
  await expect(page.locator('.tax-section')).toHaveCount(9);
  // The draft of the month is a warning, not a stop.
  await expect(page.locator('main#main')).toContainText('FA2026006');
  const download = page.getByRole('button', { name: 'Stiahnuť XML' });
  await expect(download).toBeEnabled();
  const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
  expect(file.suggestedFilename()).toBe(`KV_DPH_${input.company.icDph}_2026-03_R.xml`);
  const path = await file.path();
  expect(readFileSync(path, 'utf8')).toBe(golden);
  expect(expected.kv.sections.A1).toBe(4);

  const check = checkXml(path, 'kv_dph_2025.xsd');
  expect(check.wellFormed, check.output).not.toBe(false);
  expect(check.valid, check.output).not.toBe(false);
  if (check.valid === null) testInfo.annotations.push({ type: 'skipped', description: 'XSD of the KV not available (TAX_XSD_DIR)' });
});
