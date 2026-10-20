// The time budget of the first minute (test plan § 11.3, scenario 1, and
// matrix row A26): from the first start through the sample data and the
// wizard to the PDF of the first invoice within 60 seconds. It runs in the
// timing project, after every other test and alone, so the load of the
// other workers does not decide the result.
import { test, expect } from '@playwright/test';
import { firstRun } from './support/first-run.js';

test('the first invoice and its PDF within 60 seconds of the first start', async ({ page }) => {
  test.setTimeout(120_000);
  const { number, ms } = await firstRun(page);
  expect(number).toMatch(/^FA2026/);
  test.info().annotations.push({ type: 'first run (ms)', description: String(ms) });
  expect(ms).toBeLessThan(60_000);
});
