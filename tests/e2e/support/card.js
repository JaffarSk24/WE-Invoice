// The card of a document builds its PDF preview on the main thread when it
// opens. Under load that build can hold an action taken right away (the
// e-mail window, an added attachment) past an expectation's timeout, so a
// test that acts on the card first waits until the preview is built, as a
// person sees it on screen. Where the browser shows no preview, there is
// nothing to wait for.
import { expect } from '@playwright/test';

export async function cardSettled(page, number) {
  await expect(page.locator('main h1')).toContainText(number);
  await expect(page.locator('.detail-pdf > p.muted')).toBeHidden({ timeout: 20_000 });
}
