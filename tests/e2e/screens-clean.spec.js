// Every screen of the menu, with the sample data, shows no raw values:
// no "null", "undefined", "NaN" or "[object Object]" from a missing check,
// and no untranslated dictionary key such as "documents.action.copy".
import { test, expect } from '@playwright/test';
import { ALL_ROUTES } from '../../app/src/views/shell/nav.js';

const RAW = /\b(null|undefined|NaN)\b|\[object Object\]/;
const KEY = /\b(?:[a-z][a-zA-Z]*\.){2,}[a-zA-Z]+\b/;

test('no raw values or dictionary keys on any screen', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the screens are the same on phones');
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem('we-invoice-prefs', JSON.stringify({ language: 'sk', demo: true, onboardingDone: true }));
  });
  await page.goto('./');
  const problems = [];
  for (const route of ALL_ROUTES.filter(r => r !== 'more')) {
    await page.goto(`./#/${route}`);
    await page.waitForTimeout(700);
    const text = await page.locator('#main, main').first().innerText();
    const raw = text.match(RAW);
    const key = text.match(KEY);
    if (raw) problems.push(`${route}: "${raw[0]}"`);
    if (key) problems.push(`${route}: key ${key[0]}`);
  }
  expect(problems).toEqual([]);
});
