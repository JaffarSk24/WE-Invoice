// A received eFaktúra has no file of its own: its review shows the
// document printed by the app from its data, with the payment QR to the
// supplier's account from the XML.
import { test, expect } from '@playwright/test';
import { seed, offline, company, invoice } from './support/seed.js';

test('a received eFaktúra shows its printed picture with the payment QR', async ({ page }) => {
  await offline(page);
  const received = invoice({
    id: 'e2e-in-1', kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS', number: '260101476', vs: '202601936', bankAccountId: null,
    seller: { name: 'Reálna podpora s.r.o.', ico: '53792319', dic: '2121513515', icDph: 'SK2121513515', vatPayer: true, address: { street: 'Agátová 3460/7F', city: 'Bratislava', zip: '841 01', country: 'SK' } },
    paymentAccount: { iban: 'SK1483300000002902012085', name: null, bic: null }, payee: null,
    peppol: { direction: 'IN', status: 'RECEIVED', providerId: 'mock', providerMessageId: 'm1', receivedAt: '2026-11-09T19:41:00.000Z', acknowledgedAt: '2026-11-09T19:41:01.000Z', xmlFileId: null, errors: [] },
    inbox: { confidence: 1, needsConfirmation: false, fieldConfidence: {}, sources: {} }
  });
  await seed(page, { company: company(), documents: [received] }, { hash: '#/inbox/e2e-in-1' });
  await expect(page.locator('main h1')).toContainText('260101476');
  await expect(page.locator('.review-preview')).toHaveAttribute('data-ready', '1', { timeout: 20_000 });
  await expect(page.locator('.preview-note')).toContainText('s QR kódom na úhradu');
  await expect(page.locator('.review-preview canvas.preview-canvas').first()).toBeVisible();
  await expect(page.locator('input[data-field="iban"]')).toHaveValue('SK1483300000002902012085');
  await page.locator('.review-preview').screenshot({ path: test.info().outputPath('received-visual.png') });
});
