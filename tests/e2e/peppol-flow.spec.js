// eFaktúra end to end (test plan § 11.3, scenario 12) with a SAPI-SK
// provider and Google Drive mocked: the key is kept with the encrypted
// data, the card sends an invoice that the provider accepts (its XML is
// archived in Drive first), a refusal of the provider is told in plain
// words, and a received e-invoice is acknowledged only after it is stored
// and archived. SAPI-SK has no delivery status; DELIVERED comes from
// providers with a status API (unit tests of app/src/peppol).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { FakeDrive, newDevice, turnOnEncryption } from './support/fake-drive.js';
import { routePeppol } from './support/peppol-provider.js';
import { seed, company, contact, invoice, live } from './support/seed.js';

test.describe.configure({ timeout: 150_000 });

// The receiving company is the buyer of the UBL fixture (Gama Obchod a.s.).
const US = company({ name: 'Gama Obchod a.s.', dic: '2020000026', icDph: 'SK2020000026' });
const RECEIVED = readFileSync(new URL('../fixtures/ubl/expected/01-basic-23.xml', import.meta.url), 'utf8');
const first = invoice({ number: 'FA20260001' });
const second = invoice({ number: 'FA20260002' });

test('connect a provider, send, see a refusal and receive an e-invoice', async ({ browser }, testInfo) => {
  const drive = new FakeDrive();
  const a = await newDevice(browser, testInfo, drive);
  const provider = await routePeppol(a.context, { clientId: 'client-e2e', clientSecret: 'vpt_e2e', inbox: [{ id: 'in-1', xml: RECEIVED, senderParticipantId: '0245:2020000004' }] });
  await seed(a.page, { company: US, contacts: [contact()], documents: [first, second] });
  await turnOnEncryption(a.page, 'Silne-Heslo-2026', expect);

  await a.page.goto('./#/settings/peppol');
  await expect(a.page.locator('[data-provider="verteco"] input')).toBeChecked();
  await a.page.fill('#peppol-cred-clientId', 'client-e2e');
  await a.page.fill('#peppol-cred-clientSecret', 'vpt_e2e');
  await a.page.locator('[data-action="test-connection"]').click();
  await expect(a.page.locator('.toast', { hasText: 'Pripojenie je uložené.' })).toBeVisible({ timeout: 15_000 });
  // The key lives only inside the encrypted data file.
  expect(drive.contents().some(f => f.text.includes('vpt_e2e'))).toBe(false);

  // eFaktúra is a closed beta: without the invite the card says so.
  const send = async (doc) => {
    await a.page.goto(`./#/invoices/${doc.id}`);
    // The card redraws when a background round finishes; open the menu again then.
    await expect(async () => {
      if (!(await a.page.locator('#detail-peppol').isVisible())) await a.page.locator('.more-actions > summary').click();
      await a.page.locator('#detail-peppol').click({ timeout: 2000 });
    }).toPass({ timeout: 15_000 });
  };
  await send(first);
  await expect(a.page.locator('.toast', { hasText: 'eFaktúry sú v bete.' })).toBeVisible({ timeout: 20_000 });
  expect(provider.sent).toHaveLength(0);
  await a.page.goto('./#/settings/peppol');
  await a.page.fill('#peppol-beta-code', 'BETA-E2E');
  await a.page.locator('[data-action="redeem"]').click();
  await expect(a.page.locator('.peppol-result.is-ok').first()).toBeVisible();

  await send(first);
  await expect(a.page.locator('.toast', { hasText: 'eFaktúra FA20260001 je odoslaná.' })).toBeVisible({ timeout: 20_000 });
  expect(provider.sent).toHaveLength(1);
  expect(provider.sent[0].body.payload).toContain('<cbc:ID>FA20260001</cbc:ID>');
  expect(provider.sent[0].participant).toBe('0245:2020000026');
  await expect.poll(async () => (await live(a.page, 'documents')).find(d => d.id === first.id).peppol?.status).toBe('ACCEPTED');
  expect(drive.contents().some(f => f.path.includes('/archive/2026/'))).toBe(true);
  await a.page.goto('./#/efaktury-out');
  await expect(a.page.locator('main#main')).toContainText('FA20260001');
  // Phones show the number and the partner on the card; the table has the status.
  if (!testInfo.project.use.isMobile) await expect(a.page.locator('.data-table')).toContainText('Prijatá poskytovateľom');

  // The provider refuses the next one: the user reads why.
  provider.fail = { status: 200, body: { status: 'REJECTED', message: 'Receiver not accepting' }, times: 1 };
  await send(second);
  await expect(a.page.locator('.toast-error, .toast', { hasText: /FA20260002|odmietol/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => (await live(a.page, 'documents')).find(d => d.id === second.id).peppol?.status).toMatch(/INVALID|REJECTED/);

  // Receiving: stored, archived, then acknowledged.
  await a.page.goto('./#/efaktury-in');
  await a.page.locator('[data-action="receive-now"]').click();
  await expect(a.page.locator('main#main')).toContainText('Alfa Softvér s.r.o.', { timeout: 20_000 });
  await expect.poll(() => provider.acked).toEqual(['in-1']);
  const received = (await live(a.page, 'documents')).find(d => d.kind === 'RECEIVED_INVOICE');
  expect(received).toMatchObject({ number: 'FA2027001' });
  expect(drive.contents().filter(f => f.path.includes('/archive/')).length).toBeGreaterThanOrEqual(2);

  await a.context.close();
});
