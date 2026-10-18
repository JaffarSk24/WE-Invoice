// Contacts as data: checks before saving, search, balance, duplicates,
// merge, and the register and VAT checks with the gateway mocked.
import { describe, it, expect, vi } from 'vitest';
import {
  blankContact, normalizeContact, emailsFor, searchContacts, contactBalance, findDuplicates, mergeContacts, lookupToContact, contactDocuments
} from './model.js';
import { lookupByIco, searchByName, runVatChecks, vatIndicator, combinedStatus, isFresh } from './checks.js';

const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const transportFor = (routes) => ({
  gatewayUrl: (p) => `https://gw${p}`,
  http: vi.fn(async ({ url }) => {
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    if (!hit) throw new Error(`unexpected ${url}`);
    return typeof hit[1] === 'function' ? hit[1](url) : hit[1];
  })
});

describe('normalizeContact', () => {
  it('requires a name and checks the identifiers', () => {
    const { errors } = normalizeContact({ name: ' ', ico: '12345678', dic: '123', icDph: 'SK123', iban: 'SK00' });
    expect(errors).toEqual({ name: 'NAME_REQUIRED', ico: 'ICO_INVALID', dic: 'DIC_INVALID', icDph: 'VAT_ID_INVALID', iban: 'IBAN_INVALID' });
  });

  it('accepts a valid card and cleans spaces', () => {
    const { contact, errors } = normalizeContact({
      name: ' Alfa s. r. o. ', ico: '12 345 679', dic: '2020000004', icDph: 'sk 2020000004', iban: 'SK31 1200 0000 1987 4263 7541',
      emails: [{ address: ' a@alfa.sk ', purposes: ['INVOICE', 'BOGUS'] }, { address: '' }], dueDays: '30', discountPct: '5'
    });
    expect(errors).toEqual({});
    expect(contact).toMatchObject({ name: 'Alfa s. r. o.', ico: '12345679', icDph: 'SK2020000004', dueDays: 30, discountPct: '5', sendReminders: true });
    expect(contact.emails).toEqual([{ address: 'a@alfa.sk', purposes: ['INVOICE'] }]);
  });

  it('rejects bad e-mails, due days and discounts and keeps an unknown print language empty', () => {
    const { contact, errors } = normalizeContact({ name: 'X', emails: [{ address: 'nope' }], dueDays: '-1', discountPct: '120', language: 'ru' });
    expect(errors).toMatchObject({ emails: 'EMAIL_INVALID', dueDays: 'DUE_DAYS_INVALID', discountPct: 'DISCOUNT_INVALID' });
    expect(contact.language).toBe(null);
  });

  it('does not check the IČO checksum of a foreign company', () => {
    expect(normalizeContact({ name: 'GmbH', country: 'DE', ico: 'HRB 1234' }).errors).toEqual({});
  });
});

describe('emailsFor', () => {
  const c = { emails: [{ address: 'a@x.sk', purposes: [] }, { address: 'r@x.sk', purposes: ['REMINDER'] }, { address: 'acc@x.sk', purposes: ['ACCOUNTANT'] }] };
  it('picks addresses by purpose with fallbacks', () => {
    expect(emailsFor(c, 'INVOICE')).toEqual(['a@x.sk']);
    expect(emailsFor(c, 'REMINDER')).toEqual(['r@x.sk']);
    expect(emailsFor(c, 'ACCOUNTANT')).toEqual(['acc@x.sk']);
    expect(emailsFor({ emails: [{ address: 'only@x.sk', purposes: ['REMINDER'] }] }, 'INVOICE')).toEqual(['only@x.sk']);
    expect(emailsFor({ emails: [] }, 'ACCOUNTANT')).toEqual([]);
  });
});

describe('searchContacts', () => {
  const list = [
    { id: '1', name: 'Košická stavebná', ico: '12345679', emails: [{ address: 'info@kosice.sk' }] },
    { id: '2', name: 'Alfa', dic: '2020000004', tags: ['VIP'] }
  ];
  it('finds by folded name, ids with spaces, e-mail and tag', () => {
    expect(searchContacts(list, 'kosic').map(c => c.id)).toEqual(['1']);
    expect(searchContacts(list, '123 456').map(c => c.id)).toEqual(['1']);
    expect(searchContacts(list, 'info@').map(c => c.id)).toEqual(['1']);
    expect(searchContacts(list, 'vip').map(c => c.id)).toEqual(['2']);
    expect(searchContacts(list, '').map(c => c.id)).toEqual(['2', '1']);
  });
});

describe('contactBalance', () => {
  const line = (price) => ({ id: 'l', kind: 'ITEM', name: 'x', qty: '1', unitPrice: price, priceType: 'NET', vatCategory: 'S', vatRate: '23' });
  const docs = [
    { id: 'a', kind: 'INVOICE', status: 'ISSUED', contactId: 'c', currency: 'EUR', issueDate: '2026-09-01', dueDate: '2026-09-15', lines: [line('100')], payments: [] },
    { id: 'b', kind: 'INVOICE', status: 'PAID', contactId: 'c', currency: 'EUR', issueDate: '2026-10-01', dueDate: '2026-10-15', lines: [line('100')], payments: [{ id: 'p', date: '2026-10-02', amount: '123.00', method: 'TRANSFER', source: 'MANUAL' }] },
    { id: 'd', kind: 'INVOICE', status: 'DRAFT', contactId: 'c', currency: 'EUR', lines: [line('999')] },
    { id: 'e', kind: 'INVOICE', status: 'ISSUED', contactId: 'other', currency: 'EUR', lines: [line('5')] }
  ];
  it('sums turnover and due per currency and counts overdue documents', () => {
    expect(contactBalance({ id: 'c' }, docs, '2026-10-18')).toEqual({ byCurrency: { EUR: { turnover: '246.00', due: '123.00' } }, overdue: 1 });
    expect(contactDocuments({ id: 'c' }, docs).map(d => d.id)).toEqual(['b', 'a', 'd']);
  });
  it('reads the totals of demo documents', () => {
    const demo = [{ id: 'x', kind: 'INVOICE', status: 'SENT', contactId: 'c', currency: 'EUR', dueDate: '2026-12-01', totalGross: '50.00', paidAmount: '10.00' }];
    expect(contactBalance({ id: 'c' }, demo, '2026-10-18')).toEqual({ byCurrency: { EUR: { turnover: '50.00', due: '40.00' } }, overdue: 0 });
  });
});

describe('duplicates', () => {
  const a = { id: 'a', name: 'Alfa s.r.o.', ico: '12345679', createdAt: '2026-01-01', emails: [{ address: 'a@a.sk' }], tags: ['x'] };
  const b = { id: 'b', name: 'ALFA, s. r. o.', ico: '12 345 679', createdAt: '2026-02-01', phone: '+421 900', emails: [{ address: 'A@a.sk' }, { address: 'b@a.sk' }] };
  const c = { id: 'c', name: 'Beta', createdAt: '2026-03-01' };
  const d = { id: 'd', name: 'beta', createdAt: '2026-01-15' };
  it('groups by IČO or folded name', () => {
    expect(findDuplicates([a, b, c, d])).toEqual([['a', 'b'], ['d', 'c']]);
  });
  it('merges lists without repeats and fills empty fields', () => {
    const { patch, moveDocs } = mergeContacts(a, [b], [{ id: 'doc1', contactId: 'b' }, { id: 'doc2', contactId: 'a' }]);
    expect(patch.phone).toBe('+421 900');
    expect(patch.emails.map(e => e.address)).toEqual(['a@a.sk', 'b@a.sk']);
    expect(patch.ico).toBeUndefined();
    expect(moveDocs).toEqual(['doc1']);
  });
});

describe('register and VAT checks', () => {
  it('maps a register answer to a card', () => {
    const c = lookupToContact({ name: 'Firma', ico: '12345679', country: 'CZ', address: { street: 'Ulice 1', city: 'Praha', zip: '110 00' } });
    expect(c).toMatchObject({ name: 'Firma', country: 'CZ', billingAddress: { city: 'Praha', country: 'CZ' } });
    expect(blankContact().sendReminders).toBe(true);
  });

  it('looks up SK and CZ companies and reports a missing one', async () => {
    const t = transportFor({ '/company/sk/12345679': json(200, { name: 'SK firma' }), '/company/cz/27074358': json(200, { name: 'CZ firma' }), '/company/sk/11111111': json(404, {}) });
    expect((await lookupByIco(t, '123 456 79')).name).toBe('SK firma');
    expect((await lookupByIco(t, '27074358', 'CZ')).name).toBe('CZ firma');
    await expect(lookupByIco(t, '11111111')).rejects.toMatchObject({ code: 'COMPANY_NOT_FOUND' });
    await expect(lookupByIco(t, '12')).rejects.toMatchObject({ code: 'ICO_FORMAT' });
  });

  it('searches by name only from three letters', async () => {
    const t = transportFor({ '/company/sk/search': json(200, { results: [{ name: 'Alfa' }] }) });
    expect(await searchByName(t, 'al')).toEqual([]);
    expect(await searchByName(t, 'alfa')).toEqual([{ name: 'Alfa' }]);
  });

  it('reports an unreachable gateway', async () => {
    const t = { gatewayUrl: (p) => p, http: async () => { throw new Error('down'); } };
    await expect(lookupByIco(t, '12345679')).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
  });

  it('combines VIES and the FS lists', async () => {
    const now = new Date('2026-10-18T10:00:00Z');
    const ok = transportFor({ '/vat/vies/': json(200, { valid: true, checkedAt: now.toISOString() }), '/reliability': json(200, { status: 'OK', checkedAt: now.toISOString() }) });
    const patch = await runVatChecks(ok, { icDph: 'SK2020000004' }, now);
    expect(patch.vatReliability).toMatchObject({ status: 'GREEN', value: { vies: 'VALID', fs: 'OK' } });
    const bad = transportFor({ '/vat/vies/': json(200, { valid: true }), '/reliability': json(200, { status: 'REASONS_FOR_CANCELLATION' }) });
    expect((await runVatChecks(bad, { icDph: 'SK2020000004' }, now)).vatReliability.status).toBe('RED');
    const half = transportFor({ '/vat/vies/': json(502, {}), '/reliability': json(200, { status: 'OK' }) });
    expect((await runVatChecks(half, { icDph: 'SK2020000004' }, now)).vatReliability.status).toBe('GREEN');
    const down = transportFor({ '/vat/vies/': json(502, {}), '/reliability': json(502, {}) });
    await expect(runVatChecks(down, { icDph: 'SK2020000004' }, now)).rejects.toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
    expect((await runVatChecks(down, { icDph: 'SK12' }, now)).vatReliability.status).toBe('FORMAT');
    expect(combinedStatus({ vies: { status: 'INVALID' } })).toBe('RED');
    expect(combinedStatus({})).toBe('UNKNOWN');
  });

  it('shows the traffic light for seven days', () => {
    const now = new Date('2026-10-18T10:00:00Z');
    const checked = (status, at) => ({ icDph: 'SK2020000004', vatReliability: { status, checkedAt: at } });
    expect(vatIndicator({ icDph: '' }, now)).toBe('none');
    expect(vatIndicator({ icDph: 'SK123' }, now)).toBe('yellow');
    expect(vatIndicator({ icDph: 'SK2020000004' }, now)).toBe('grey');
    expect(vatIndicator(checked('GREEN', '2026-10-12T10:00:00Z'), now)).toBe('green');
    expect(vatIndicator(checked('GREEN', '2026-10-11T09:00:00Z'), now)).toBe('grey');
    expect(vatIndicator(checked('RED', '2026-10-18T09:00:00Z'), now)).toBe('red');
    expect(vatIndicator(checked('UNKNOWN', '2026-10-18T09:00:00Z'), now)).toBe('grey');
    expect(isFresh(null, now)).toBe(false);
  });
});
