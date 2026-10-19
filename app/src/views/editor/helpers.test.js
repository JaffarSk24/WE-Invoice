// Small editor helpers: eKasa rules, payment checks, the status ribbon,
// prices, advance links, contact search and the quick contact form, the
// CSP check of the PDF frame, the content check of autosave and units.
import { describe, it, expect } from 'vitest';
import { needsEkasa, overCashLimit, vrp2Url, cashLimit } from './ekasa.js';
import { validatePayment } from './payments.js';
import { ribbonSteps } from './ribbon.js';
import { clientPrice, searchItems } from './pricing.js';
import { withDeduction } from './advances.js';
import { searchContacts, validateQuickContact, quickContactRecord } from './party-field.js';
import { missingTarget } from './missing.js';
import { hasContent } from './editor-actions.js';
import { unitLabel, relabelUnits } from './units.js';
import { previewDocument } from './preview.js';
import { fetchEcbRate } from './fx.js';
import { cspAllowsBlobFrames } from '../documents/pdf-frame.js';
import { pdfOptions } from '../documents/pdf-options.js';
import { COMPANY } from '../documents/fixtures.js';

const DAY = '2026-10-18';

describe('eKasa stage 1', () => {
  it('asks for a receipt for cash, card and on-site QR unless the company is exempt', () => {
    expect(needsEkasa(COMPANY, 'CASH')).toBe(true);
    expect(needsEkasa(COMPANY, 'QR_ON_SITE')).toBe(true);
    expect(needsEkasa(COMPANY, 'TRANSFER')).toBe(false);
    expect(needsEkasa({ ...COMPANY, ekasaExempt: true }, 'CARD')).toBe(false);
    expect(vrp2Url(DAY)).toBe('https://vrp2.financnasprava.sk');
    expect(vrp2Url('2020-01-01')).toBeNull();
  });

  it('warns about cash between businesses above the legal limit', () => {
    expect(cashLimit(DAY).amount).toBe('5000');
    expect(overCashLimit({ amount: '5000.01', method: 'CASH', b2b: true, date: DAY })).toBe(true);
    expect(overCashLimit({ amount: '5000.00', method: 'CASH', b2b: true, date: DAY })).toBe(false);
    expect(overCashLimit({ amount: '9000', method: 'CASH', b2b: false, date: DAY })).toBe(false);
    expect(overCashLimit({ amount: '9000', method: 'CARD', b2b: true, date: DAY })).toBe(false);
  });

  it('checks a payment', () => {
    expect(validatePayment({ amount: '10', date: DAY })).toEqual({});
    expect(validatePayment({ amount: '0', date: null })).toEqual({ amount: 'documents.payments.errors.amount', date: 'documents.payments.errors.date' });
  });
});

describe('ribbon', () => {
  it('marks the steps reached', () => {
    const done = (doc, status) => ribbonSteps(doc, status).filter(s => s.done).map(s => s.id);
    expect(done({ kind: 'INVOICE' }, 'ISSUED')).toEqual(['ISSUED']);
    expect(done({ kind: 'INVOICE', sendLog: [{ result: 'OK' }] }, 'PAID')).toEqual(['ISSUED', 'SENT', 'PAID']);
    expect(done({ kind: 'INVOICE', peppol: { status: 'DELIVERED', sentAt: 'x' } }, 'ISSUED')).toEqual(['ISSUED', 'SENT', 'DELIVERED']);
    expect(done({ kind: 'QUOTE' }, 'ACCEPTED')).toEqual(['ISSUED', 'SENT', 'ACCEPTED']);
  });
});

describe('prices and advances', () => {
  it('prices an item for the client through the core, else by its list price', () => {
    const item = { id: 'i', name: 'Hodina', code: 'H1', price: '40', priceType: 'NET', prices: { vo: '30' } };
    expect(clientPrice(item)).toEqual({ unitPrice: '40', priceType: 'NET', discountPct: null });
    expect(clientPrice(item, { contact: { priceLevelId: 'vo' }, priceLevels: [{ id: 'vo', name: 'VO' }] }).unitPrice).toBe('30');
    expect(clientPrice({ id: 'x', name: 'Bez ceny' })).toEqual({ unitPrice: null, priceType: 'NET', discountPct: null });
    expect(searchItems([item, { id: 'j', name: 'Iné', price: '1' }], 'hod').map(i => i.id)).toEqual(['i']);
    expect(searchItems([item], 'h1')[0].hint).toContain('40 EUR');
  });

  it('sets, changes and removes an advance deduction', () => {
    const links = [{ kind: 'FROM_PROFORMA', docId: 'p' }];
    const one = withDeduction(links, 'a', '100');
    expect(one).toEqual([...links, { kind: 'ADVANCE_DEDUCTION', docId: 'a', amount: '100.00' }]);
    expect(withDeduction(one, 'a', '50.5')[1].amount).toBe('50.50');
    expect(withDeduction(one, 'a', null)).toEqual(links);
  });
});

describe('client picker', () => {
  const contacts = [{ id: 'a', name: 'Kováč s. r. o.', ico: '35757442', billingAddress: { city: 'Košice' } }, { id: 'b', name: 'Beta', dic: '2021234567' }, { id: 'c', name: 'Old', anonymizedAt: 'x' }];

  it('finds contacts by name without diacritics and by identifiers', () => {
    expect(searchContacts(contacts, 'kovac').map(c => c.id)).toEqual(['a']);
    expect(searchContacts(contacts, '357 574').map(c => c.id)).toEqual(['a']);
    expect(searchContacts(contacts, '2021234567').map(c => c.id)).toEqual(['b']);
    expect(searchContacts(contacts, 'old')).toEqual([]);
  });

  it('checks and builds the quick contact', () => {
    expect(validateQuickContact({ name: '' })).toEqual({ name: 'documents.party.errors.name' });
    expect(validateQuickContact({ name: 'X', ico: '12345678', dic: '1', icDph: 'X', email: 'a@' })).toEqual({
      ico: 'documents.party.errors.ico', dic: 'documents.party.errors.dic', icDph: 'documents.party.errors.icDph', email: 'documents.party.errors.email'
    });
    expect(validateQuickContact({ name: 'X', ico: '35757442', dic: '2021234567', icDph: 'SK2021234567', email: 'a@b.sk' })).toEqual({});
    const record = quickContactRecord({ name: 'X', ico: '35757442', icDph: 'sk2021234567', city: 'KE', country: 'cz', email: 'a@b.sk' });
    expect(record).toMatchObject({ kind: 'COMPANY', icDph: 'SK2021234567', country: 'CZ', billingAddress: { city: 'KE', country: 'CZ' }, emails: [{ address: 'a@b.sk', purposes: ['INVOICE'] }] });
    expect(quickContactRecord({ name: 'Jana' }).kind).toBe('PERSON');
  });
});

describe('editor plumbing', () => {
  it('routes missing particulars to their place', () => {
    expect(missingTarget('seller.icDph')).toBe('company');
    expect(missingTarget('buyer.address')).toBe('party');
    expect(missingTarget('lines[0].name')).toBe('lines');
    expect(missingTarget('issueDate')).toBe('head.issueDate');
  });

  it('stores a new draft only once it has content', () => {
    expect(hasContent({ lines: [{ name: '', unitPrice: '0' }] })).toBe(false);
    expect(hasContent({ lines: [{ name: 'X' }] })).toBe(true);
    expect(hasContent({ lines: [{ unitPrice: '5' }] })).toBe(true);
    expect(hasContent({ contactId: 'c', lines: [] })).toBe(true);
  });

  it('labels units in the print language and keeps typed labels', () => {
    expect(unitLabel('HUR', 'en')).toBe('h');
    expect(unitLabel('C62', 'xx')).toBe('ks');
    const lines = [{ unit: { code: 'HUR', label: 'hod.' } }, { unit: { code: 'C62', label: 'balík' } }, { kind: 'TEXT' }];
    expect(relabelUnits(lines, 'de')).toEqual([{ unit: { code: 'HUR', label: 'Std.' } }, { unit: { code: 'C62', label: 'balík' } }, { kind: 'TEXT' }]);
  });

  it('previews a draft with the number to come and the company as seller', () => {
    const doc = previewDocument({ id: 'd', number: null, seller: null }, { company: { ...COMPANY, id: 'co' }, totals: { gross: '1' }, number: 'FA1' });
    expect(doc).toMatchObject({ number: 'FA1', totals: { gross: '1' }, seller: { name: 'Alfa s. r. o.' } });
  });

  it('builds the PDF options from the company', () => {
    const options = pdfOptions({ links: [{ docId: 'i' }] }, { logoDataUrl: 'data:image/png;base64,x', defaults: { showMadeWith: false } }, [{ id: 'i', number: 'FA9' }]);
    expect(options).toEqual({ images: { logo: 'data:image/png;base64,x' }, linkedNumbers: { i: 'FA9' }, showMadeWith: false });
  });

  it('reads the frame policy of the page', () => {
    expect(cspAllowsBlobFrames(null)).toBe(true);
    expect(cspAllowsBlobFrames("default-src 'self'; frame-src https://accounts.google.com")).toBe(false);
    expect(cspAllowsBlobFrames("default-src 'self'; frame-src blob: https://accounts.google.com")).toBe(true);
    expect(cspAllowsBlobFrames("default-src 'self' blob:")).toBe(true);
    expect(cspAllowsBlobFrames("default-src 'self'")).toBe(false);
  });

  it('gets the ECB rate through the gateway', async () => {
    const transport = (status, body) => ({ gatewayUrl: (p) => `https://gw${p}`, http: async (req) => { transport.last = req.url; return { ok: status === 200, status, json: async () => body }; } });
    const ok = transport(200, { date: '2026-10-16', base: 'EUR', rates: { CZK: '24.335' } });
    await expect(fetchEcbRate(ok, 'CZK', DAY)).resolves.toEqual({ rate: '24.335', date: '2026-10-16' });
    await expect(fetchEcbRate(transport(200, { rates: {} }), 'USD', DAY)).rejects.toMatchObject({ code: 'FX_RATE_UNKNOWN' });
    await expect(fetchEcbRate(transport(502, {}), 'USD', DAY)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    await expect(fetchEcbRate({ gatewayUrl: () => 'x', http: async () => { throw new Error('down'); } }, 'USD', DAY)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });
});
