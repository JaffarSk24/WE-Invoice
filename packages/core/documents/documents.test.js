// Document kinds, statuses, edit rules and the particulars of § 74 ods. 1.
import { describe, it, expect } from 'vitest';
import {
  ublTypeCode, allowedStatuses, canTransition, isTaxDocument, isPayable, isReceived, documentStatus, canEdit, canUnlock,
  missingParticulars, requiredTexts, companySnapshot, contactSnapshot
} from './index.js';
import { DOCUMENT_KINDS } from '../schema/enums.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const company = (over = {}) => ({
  name: 'Firma s. r. o.', legalForm: 'SRO', taxpayerType: 'PO', ico: '36835587', dic: '2020123457', icDph: 'SK2020123457', vatMode: 'PAYER',
  registerEntry: 'OR OS Bratislava I, odd. Sro, vl. c. 1/B', address: { street: 'Hlavna 1', city: 'Bratislava', zip: '81101', country: 'SK' },
  email: 'a@b.sk', peppol: { participantId: '0245:2020123457' }, ...over
});
const contact = (over = {}) => ({
  id: 'c1', kind: 'COMPANY', name: 'Odberatel a. s.', ico: '12345679', dic: '1023456786', icDph: 'SK1023456786', country: 'SK',
  billingAddress: { street: 'Dolna 2', city: 'Kosice', zip: '04001' }, emails: [{ address: 'x@y.sk', purposes: ['REMINDER'] }, { address: 'inv@y.sk', purposes: ['INVOICE'] }], ...over
});
const line = (over = {}) => ({ id: 'l1', name: 'Sluzba', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23', ...over });
const invoice = (over = {}) => ({
  kind: 'INVOICE', status: 'ISSUED', number: 'FA20260001', currency: 'EUR', issueDate: '2026-10-18', taxDate: '2026-10-18', dueDate: '2026-11-01',
  seller: companySnapshot(company()), buyer: contactSnapshot(contact()), lines: [line()], payments: [], ...over
});

describe('kinds', () => {
  it('UNCL1001 codes for tax documents, null otherwise', () => {
    expect(ublTypeCode('INVOICE')).toBe('380');
    expect(ublTypeCode('CREDIT_NOTE')).toBe('381');
    expect(ublTypeCode('DEBIT_NOTE')).toBe('383');
    expect(ublTypeCode('ADVANCE_TAX_DOC')).toBe('388');
    expect(ublTypeCode('SELF_BILLING')).toBe('389');
    expect(ublTypeCode('PROFORMA')).toBeNull();
    expect(ublTypeCode('QUOTE')).toBeNull();
    expect(code(() => ublTypeCode('NOPE'))).toBe('DOCUMENT_KIND_INVALID');
  });

  it('every kind has statuses starting with a draft or an inbox state', () => {
    for (const kind of DOCUMENT_KINDS) {
      const statuses = allowedStatuses(kind);
      expect(statuses.length).toBeGreaterThan(1);
      expect(['DRAFT', 'TO_PROCESS']).toContain(statuses[0]);
      expect(statuses).toContain('CANCELLED');
    }
    expect(allowedStatuses('QUOTE')).toEqual(['DRAFT', 'ISSUED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']);
    expect(allowedStatuses('INVOICE')).toContain('OVERDUE');
    expect(code(() => allowedStatuses('X'))).toBe('DOCUMENT_KIND_INVALID');
  });

  it('transitions', () => {
    expect(canTransition('INVOICE', 'DRAFT', 'ISSUED')).toBe(true);
    expect(canTransition('INVOICE', 'ISSUED', 'SENT')).toBe(true);
    expect(canTransition('INVOICE', 'ISSUED', 'PAID')).toBe(false);
    expect(canTransition('INVOICE', 'CANCELLED', 'DRAFT')).toBe(false);
    expect(canTransition('QUOTE', 'SENT', 'ACCEPTED')).toBe(true);
    expect(canTransition('INVOICE', 'SENT', 'ACCEPTED')).toBe(false);
    expect(canTransition('RECEIVED_INVOICE', 'TO_PROCESS', 'PROCESSED')).toBe(true);
    expect(canTransition('RECEIVED_INVOICE', 'PAID', 'BOOKED')).toBe(true);
  });

  it('classifies kinds', () => {
    expect(isTaxDocument('INVOICE')).toBe(true);
    expect(isTaxDocument('PROFORMA')).toBe(false);
    expect(isPayable('PROFORMA')).toBe(true);
    expect(isPayable('QUOTE')).toBe(false);
    expect(isReceived('EXPENSE_RECEIPT')).toBe(true);
    expect(isReceived('INVOICE')).toBe(false);
  });
});

describe('documentStatus', () => {
  it('derives payment statuses by the local date', () => {
    expect(documentStatus(invoice(), '2026-10-20')).toBe('ISSUED');
    expect(documentStatus(invoice(), '2026-11-02')).toBe('OVERDUE');
    expect(documentStatus(invoice({ payments: [{ id: 'p', amount: '50' }] }), '2026-10-20')).toBe('PARTIALLY_PAID');
    expect(documentStatus(invoice({ payments: [{ id: 'p', amount: '50' }] }), '2026-11-02')).toBe('OVERDUE');
    expect(documentStatus(invoice({ payments: [{ id: 'p', amount: '123' }] }), '2026-11-02')).toBe('PAID');
    expect(documentStatus(invoice({ payments: [{ id: 'p', amount: '200' }] }), '2026-11-02')).toBe('OVERPAID');
    expect(documentStatus(invoice({ status: 'SENT' }), '2026-10-20')).toBe('SENT');
    expect(documentStatus(invoice({ status: 'PAID' }), '2026-10-20')).toBe('ISSUED');
  });

  it('keeps drafts and final statuses', () => {
    expect(documentStatus(invoice({ status: 'DRAFT' }), '2027-01-01')).toBe('DRAFT');
    expect(documentStatus(invoice({ status: 'CANCELLED' }), '2027-01-01')).toBe('CANCELLED');
    expect(documentStatus(invoice({ status: undefined }), '2027-01-01')).toBe('DRAFT');
    expect(documentStatus({ kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS' }, '2027-01-01')).toBe('TO_PROCESS');
  });

  it('expires offers and leaves other kinds as stored', () => {
    expect(documentStatus({ kind: 'QUOTE', status: 'SENT', validUntil: '2026-10-31' }, '2026-10-31')).toBe('SENT');
    expect(documentStatus({ kind: 'QUOTE', status: 'SENT', validUntil: '2026-10-31' }, '2026-11-01')).toBe('EXPIRED');
    expect(documentStatus({ kind: 'QUOTE', status: 'ACCEPTED', validUntil: '2026-10-31' }, '2026-11-01')).toBe('ACCEPTED');
    expect(documentStatus({ kind: 'DELIVERY_NOTE', status: 'SENT' }, '2026-11-01')).toBe('SENT');
    expect(documentStatus({ kind: 'DELIVERY_NOTE', status: 'PAID' }, '2026-11-01')).toBe('DRAFT');
    expect(documentStatus(invoice({ dueDate: '2000-01-01' }))).toBe('OVERDUE');
  });
});

describe('canEdit', () => {
  it('open documents are editable', () => {
    expect(canEdit(invoice())).toEqual({ editable: true });
    expect(canEdit(invoice({ peppol: { direction: 'OUT', status: 'DRAFT' } }))).toEqual({ editable: true });
    expect(canEdit(invoice({ peppol: { direction: 'OUT', status: 'INVALID' } })).editable).toBe(true);
  });

  it('locked, cancelled and Peppol-sent documents are not', () => {
    expect(canEdit(invoice({ lockedAt: '2026-10-18T10:00:00.000Z' }))).toEqual({ editable: false, reason: 'DOCUMENT_LOCKED' });
    expect(canEdit(invoice({ status: 'CANCELLED' }))).toEqual({ editable: false, reason: 'DOCUMENT_CANCELLED' });
    for (const status of ['SENDING', 'ACCEPTED', 'DELIVERED', 'REJECTED']) {
      expect(canEdit(invoice({ lockedAt: 'x', peppol: { direction: 'OUT', status } }))).toEqual({ editable: false, reason: 'DOCUMENT_PEPPOL_SENT' });
    }
    expect(canEdit(invoice({ peppol: { direction: 'IN', status: 'RECEIVED' } })).editable).toBe(true);
  });

  it('only a plain lock may be lifted', () => {
    expect(canUnlock(invoice({ lockedAt: 'x' }))).toBe(true);
    expect(canUnlock(invoice({ lockedAt: 'x', peppol: { direction: 'OUT', status: 'DELIVERED' } }))).toBe(false);
    expect(canUnlock(invoice())).toBe(false);
  });
});

describe('snapshots', () => {
  it('copy the company and the contact', () => {
    const s = companySnapshot(company());
    expect(s).toMatchObject({ name: 'Firma s. r. o.', ico: '36835587', icDph: 'SK2020123457', vatPayer: true, peppolId: '0245:2020123457', address: { city: 'Bratislava', country: 'SK' } });
    expect(companySnapshot(company({ vatMode: 'NONPAYER', icDph: 'SK2020123457', address: undefined }))).toMatchObject({ icDph: null, vatPayer: false, address: {} });
    const b = contactSnapshot(contact());
    expect(b).toMatchObject({ contactId: 'c1', email: 'inv@y.sk', vatPayer: true, address: { city: 'Kosice', country: 'SK' } });
    expect(contactSnapshot(contact({ emails: [{ address: 'only@y.sk' }], icDph: null, billingAddress: undefined, country: 'CZ' }))).toMatchObject({ email: 'only@y.sk', vatPayer: false, address: { country: 'CZ' } });
    expect(contactSnapshot({ name: 'X' })).toMatchObject({ contactId: null, email: null, ico: null });
  });
});

describe('missingParticulars', () => {
  it('is empty for a complete invoice', () => {
    expect(missingParticulars(invoice(), company())).toEqual([]);
  });

  it('names every missing seller and buyer field', () => {
    const doc = invoice({ seller: { name: '' }, buyer: null });
    const codes = missingParticulars(doc, company()).map(m => m.code);
    expect(codes).toEqual(expect.arrayContaining(['SELLER_NAME', 'SELLER_ADDRESS', 'SELLER_VAT_ID', 'SELLER_ICO', 'SELLER_REGISTER_ENTRY', 'BUYER_NAME']));
    expect(missingParticulars(invoice({ buyer: { name: 'B', address: {} } }), company()).map(m => m.code)).toEqual(['BUYER_ADDRESS']);
    expect(missingParticulars(invoice({ seller: null }), undefined).map(m => m.code)).toEqual(expect.arrayContaining(['SELLER_NAME']));
  });

  it('a non-payer needs the DIC instead of the VAT id and a rate is not required', () => {
    const nonPayer = (over) => company({ vatMode: 'NONPAYER', icDph: null, ...over });
    const np = nonPayer();
    const doc = invoice({ seller: companySnapshot(np), lines: [line({ vatRate: null })] });
    expect(missingParticulars(doc, np)).toEqual([]);
    expect(missingParticulars(invoice({ seller: companySnapshot(nonPayer({ dic: null })) }), nonPayer({ dic: null })).map(m => m.code)).toContain('SELLER_DIC');
    expect(missingParticulars(invoice({ seller: { ...companySnapshot(np), vatPayer: false }, lines: [line({ vatRate: null })] })).map(m => m.code)).toEqual([]);
  });

  it('checks the number only after the draft, the dates and the lines', () => {
    expect(missingParticulars(invoice({ status: 'DRAFT', number: null }), company())).toEqual([]);
    expect(missingParticulars(invoice({ number: null }), company()).map(m => m.code)).toEqual(['NUMBER']);
    expect(missingParticulars(invoice({ issueDate: null, taxDate: 'bad' }), company()).map(m => m.code)).toEqual(['ISSUE_DATE', 'TAX_DATE']);
    expect(missingParticulars(invoice({ lines: [] }), company()).map(m => m.code)).toEqual(['LINES']);
    const bad = invoice({ lines: [line({ name: '', qty: 'x', unitPrice: null, vatRate: '0' }), line({ id: 'e', vatCategory: 'E' }), line({ id: 'o', vatCategory: 'L' }), { kind: 'TEXT', name: '' }] });
    expect(missingParticulars(bad, company())).toEqual([
      { field: 'lines[0].name', code: 'LINE_NAME' }, { field: 'lines[0].qty', code: 'LINE_QTY' }, { field: 'lines[0].unitPrice', code: 'LINE_UNIT_PRICE' },
      { field: 'lines[0].vatRate', code: 'LINE_VAT_RATE' }, { field: 'lines[1].exemptionReasonCode', code: 'LINE_EXEMPTION_REASON' }, { field: 'lines[2].vatCategory', code: 'LINE_VAT_CATEGORY' }
    ]);
    expect(missingParticulars(invoice({ lines: [line({ vatCategory: 'AE', exemptionReasonText: '§ 69' }), line({ id: 'z', vatCategory: 'Z' })] }), company())).toEqual([]);
  });

  it('foreign currency needs a rate, corrections need a reference and a reason', () => {
    expect(missingParticulars(invoice({ currency: 'CZK' }), company()).map(m => m.code)).toEqual(['FX_RATE']);
    expect(missingParticulars(invoice({ currency: 'CZK', fxRate: '25.2' }), company())).toEqual([]);
    const cn = invoice({ kind: 'CREDIT_NOTE', links: [], correctionReason: null });
    expect(missingParticulars(cn, company()).map(m => m.code)).toEqual(['CORRECTION_REFERENCE', 'CORRECTION_REASON']);
    expect(missingParticulars({ ...cn, links: [{ kind: 'CORRECTS', docId: 'i1' }], correctionReason: 'wrong qty' }, company())).toEqual([]);
  });

  it('non-tax documents need only the basics', () => {
    expect(missingParticulars({ kind: 'QUOTE', status: 'DRAFT', seller: { name: 'S' }, issueDate: '2026-10-18', lines: [line({ vatRate: null })] })).toEqual([]);
    expect(missingParticulars({ kind: 'PROFORMA', status: 'DRAFT', seller: { name: 'S' }, lines: [] }).map(m => m.code)).toEqual(['ISSUE_DATE', 'LINES']);
  });
});

describe('requiredTexts', () => {
  it('lists the legal texts from legislation in the document language', () => {
    const doc = invoice({ language: 'en', lines: [line({ vatCategory: 'AE' }), line({ id: 'e', vatCategory: 'E' })] });
    expect(requiredTexts(doc, company({ cashBasis: true }), '2026-10-18')).toEqual([
      { key: 'reverseCharge', text: 'reverse charge' }, { key: 'exempt', text: 'VAT exempt' }, { key: 'cashBasis', text: 'cash accounting scheme' }
    ]);
    expect(requiredTexts(invoice({ language: 'cs' }), company({ vatMode: 'NONPAYER' }), '2026-10-18')).toEqual([{ key: 'nonPayer', text: 'Není plátce DPH' }]);
    expect(requiredTexts(invoice({ kind: 'SELF_BILLING' }), company(), '2026-10-18')).toEqual([{ key: 'selfBilling', text: 'vyhotovenie faktúry odberateľom' }]);
    expect(requiredTexts(invoice({ language: 'cs', seller: { name: 'S', vatPayer: false } }), undefined, '2026-10-18').length).toBe(1);
    expect(requiredTexts(invoice({ language: 'cs' }), company({ cashBasis: true }), '2026-10-18')).toEqual([{ key: 'cashBasis', text: 'uplatňovanie DPH na základe prijatia platby' }]);
    expect(requiredTexts(invoice(), company(), '2026-10-18')).toEqual([]);
    expect(code(() => requiredTexts(invoice(), company(), null))).toBe('DATE_INVALID');
  });
});
