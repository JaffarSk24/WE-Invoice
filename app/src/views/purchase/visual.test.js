// @vitest-environment happy-dom
// A received eFaktúra printed by the app: the supplier in the seller's
// place, its account from the XML for the payment QR, nothing of the
// user's company, and the supplier's own PDF first when the XML has one.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseUbl } from '@we-invoice/core';
import { buildDocDefinition } from '../../pdf/index.js';
import { printableReceived, payeeAccount, receivedVisual, knownSupplierAccount } from './visual.js';

const xml = readFileSync('tests/fixtures/ubl/expected/01-basic-23.xml', 'utf8');
const company = { id: 'c1', name: 'White Eagles & Co. s. r. o.', ico: '57098581', logo: 'data:image/png;base64,AAAA', defaults: { language: 'sk', texts: { footer: 'Our own footer' } } };

describe('received e-invoice visual', () => {
  it('prints the supplier as the seller with a payment QR to its account', () => {
    const { document } = parseUbl(xml, { received: true });
    const doc = { ...document, status: 'TO_PROCESS', payments: [] };
    expect(payeeAccount(doc)?.iban).toMatch(/^SK\d{22}$/);
    const printable = printableReceived(doc, company);
    expect(printable.document).toMatchObject({ kind: 'INVOICE', bankAccountId: 'payee' });
    expect(printable.company).toMatchObject({ name: doc.seller.name, bankAccounts: [expect.objectContaining({ iban: payeeAccount(doc).iban })] });
    expect(printable.company.logo).toBeUndefined();
    const definition = JSON.stringify(buildDocDefinition(printable.document, printable.company, { allowIncomplete: true }));
    expect(definition).toContain('"qr"');
    expect(definition).toContain(doc.seller.name.replace(/"/g, '\\"'));
    expect(definition).not.toContain('Our own footer');
  });

  it('shows no QR for a document already paid, and prefers the supplier PDF when there is one', async () => {
    const { document } = parseUbl(xml, { received: true });
    const paid = { ...document, payments: [{ id: 'p', date: document.issueDate, amount: document.totals.payable, currency: document.currency, method: 'TRANSFER', source: 'MANUAL' }] };
    const printable = printableReceived(paid, company);
    expect(JSON.stringify(buildDocDefinition(printable.document, printable.company, { allowIncomplete: true }))).not.toContain('"qr"');
    const openPdf = vi.fn(async () => ({ numPages: 1, renderPage: async () => {}, destroy: async () => {} }));
    const buildPdf = vi.fn();
    const withPdf = { ...document, attachments: [{ id: 'a1', name: 'faktura.pdf', mime: 'application/pdf' }] };
    const out = await receivedVisual(withPdf, company, { readAttachment: async () => new Uint8Array([37, 80, 68, 70]), buildPdf, openPdf, width: 100, max: 1 });
    expect(out.source).toBe('ATTACHMENT');
    expect(buildPdf).not.toHaveBeenCalled();
  });

  it('takes the account known for the supplier when the XML has none', () => {
    const doc = { id: 'n', kind: 'RECEIVED_INVOICE', contactId: 'k', payee: null, paymentAccount: null };
    const earlier = { id: 'o', kind: 'RECEIVED_INVOICE', contactId: 'k', issueDate: '2026-09-30', payee: { iban: 'SK1483300000002902012085' } };
    expect(knownSupplierAccount(doc, [], [earlier])).toEqual({ iban: 'SK1483300000002902012085', bic: null });
    expect(knownSupplierAccount(doc, [{ id: 'k', iban: 'SK3911000000002900123456' }], [earlier]).iban).toBe('SK3911000000002900123456');
    expect(payeeAccount(doc, knownSupplierAccount(doc, [], [earlier])).iban).toBe('SK1483300000002902012085');
  });
});
