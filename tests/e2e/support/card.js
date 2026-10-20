// A document opened on its own address (the card of an issued one, the
// editor of a draft) builds its PDF preview on the main thread. Under load
// that build can hold an action taken right away (the e-mail window, an
// added attachment) past an expectation's timeout, so a test that acts on
// the document first waits until the preview is built, as a person sees it
// on screen. Where the browser shows no preview, there is nothing to wait
// for. The first render right after the app starts (its route loads on
// first use) gets the same allowance.
import { expect } from '@playwright/test';

const SETTLE_MS = 20_000;
const PREVIEW_STATUS = '.detail-pdf > p.muted, .editor-preview .pdf-status';

export async function cardSettled(page, number) {
  const title = page.locator('main h1').first();
  if (number) await expect(title).toContainText(number, { timeout: SETTLE_MS });
  else await expect(title).toBeVisible({ timeout: SETTLE_MS });
  await expect(page.locator(PREVIEW_STATUS)).toBeHidden({ timeout: SETTLE_MS });
}
