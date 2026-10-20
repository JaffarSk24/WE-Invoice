// The data model contract: every schema compiles, the empty roots and a
// typical invoice are valid, and every collection has a record schema.
import { describe, it, expect } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { SCHEMAS, SCHEMA_VERSION, COLLECTIONS, COLLECTION_SCHEMA, emptyCompanyData, emptyWorkspace, DOCUMENT_KINDS } from './index.js';

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const NOW = '2026-10-18T09:41:00.000Z';
const base = (id) => ({ id, createdAt: NOW, updatedAt: NOW });

const company = {
  ...base('01928a3c-0000-7000-8000-000000000001'),
  name: 'Ukážka s. r. o.', legalForm: 'SRO', taxpayerType: 'PO', ico: '12345678', dic: '2020123456', icDph: 'SK2020123456',
  vatMode: 'PAYER', vatPeriod: 'MONTH', accountingMode: 'EXTERNAL',
  address: { street: 'Hlavná 1', city: 'Bratislava', zip: '811 01', country: 'SK' },
  bankAccounts: [{ id: 'b1', iban: 'SK3112000000198742637541', currency: 'EUR', isDefault: true }],
  series: [{ id: 's1', kind: 'INVOICE', mask: 'FA{YYYY}{N:4}', reset: 'YEARLY', counters: { 2026: 1 } }]
};

const invoice = {
  ...base('01928a3c-0000-7000-8000-000000000002'),
  kind: 'INVOICE', status: 'ISSUED', seriesId: 's1', number: 'FA20260001', vs: '20260001',
  issueDate: '2026-10-18', taxDate: '2026-10-18', dueDate: '2026-11-01', currency: 'EUR',
  seller: { name: company.name, ico: company.ico, dic: company.dic, icDph: company.icDph, address: company.address },
  buyer: { name: 'Odberateľ a. s.', ico: '87654321', address: { city: 'Košice', country: 'SK' } },
  lines: [
    { id: 'l1', name: 'Konzultácia', qty: '2', unitPrice: '50.00', vatRate: '23', vatCategory: 'S', discountPct: '10' },
    { id: 'l2', name: 'Kniha', qty: '1', unitPrice: '20.00', vatRate: '5', vatCategory: 'S' }
  ],
  docDiscount: { pct: '5' },
  totals: { lineNet: '110.00', allowances: '5.50', charges: '0.00', net: '104.50', vat: '20.68', gross: '125.18', prepaid: '0.00', rounding: '0.00', payable: '125.18', breakdown: [] },
  paymentMethod: 'TRANSFER', language: 'sk', template: 'CLASSIC', links: [], payments: [], sendLog: [], tags: []
};

describe('schemas', () => {
  it('schema version is 1', () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it.each(Object.keys(SCHEMAS))('%s compiles', (name) => {
    expect(() => ajv.compile(SCHEMAS[name])).not.toThrow();
  });

  it('every collection has a record schema', () => {
    expect(Object.keys(COLLECTION_SCHEMA).sort()).toEqual([...COLLECTIONS].sort());
    Object.values(COLLECTION_SCHEMA).forEach(name => expect(SCHEMAS[name]).toBeTruthy());
  });

  it('a company and an invoice are valid', () => {
    const vc = ajv.compile(SCHEMAS.Company);
    expect(vc(company), JSON.stringify(vc.errors)).toBe(true);
    const vd = ajv.compile(SCHEMAS.Document);
    expect(vd(invoice), JSON.stringify(vd.errors)).toBe(true);
  });

  it('rejects a float amount and an unknown kind', () => {
    const vd = ajv.compile(SCHEMAS.Document);
    expect(vd({ ...invoice, lines: [{ ...invoice.lines[0], unitPrice: 50.1 }] })).toBe(false);
    expect(vd({ ...invoice, kind: 'BILL' })).toBe(false);
  });

  it('empty roots are valid', () => {
    const ws = emptyWorkspace({ workspaceId: 'w1', now: NOW, schemaVersion: SCHEMA_VERSION });
    expect(ajv.compile(SCHEMAS.Workspace)(ws)).toBe(true);
    const data = emptyCompanyData({ company, now: NOW, schemaVersion: SCHEMA_VERSION });
    expect(ajv.compile(SCHEMAS.CompanyData)(data)).toBe(true);
    COLLECTIONS.forEach(c => expect(data[c]).toEqual([]));
  });

  it('describes the e-invoice settings of a company and the send queue of a document', () => {
    const vc = ajv.compile(SCHEMAS.Company);
    const peppol = { providerId: 'verteco', participantId: '0245:2020123456', enabled: true, sandbox: false, autoReceive: true, emailCopy: false, vpdsDone: true, registered: null };
    expect(vc({ ...company, peppol }), JSON.stringify(vc.errors)).toBe(true);
    expect(vc({ ...company, peppol: { ...peppol, registered: true } })).toBe(true);
    expect(vc({ ...company, peppol: { ...peppol, autoReceive: 'yes' } })).toBe(false);
    expect(vc({ ...company, peppol: { ...peppol, registered: 'no' } })).toBe(false);
    const vd = ajv.compile(SCHEMAS.Document);
    const state = { direction: 'OUT', status: 'FAILED', revision: 1, attempts: 2, nextAttemptAt: NOW, statusChecks: 0, nextCheckAt: null };
    expect(vd({ ...invoice, peppol: state }), JSON.stringify(vd.errors)).toBe(true);
    expect(vd({ ...invoice, peppol: { ...state, attempts: -1 } })).toBe(false);
    expect(vd({ ...invoice, peppol: { ...state, statusChecks: 1.5 } })).toBe(false);
    expect(vd({ ...invoice, peppol: { ...state, nextAttemptAt: 'tomorrow' } })).toBe(false);
    expect(vd({ ...invoice, peppol: { ...state, nextCheckAt: 5 } })).toBe(false);
    const invalid = { ...state, status: 'INVALID', skippedAttachments: ['zmluva.docx'], errors: [{ code: 'MESSAGE_TOO_LARGE', message: 'BT-125', field: 'attachments', params: { bytes: 11000000, limit: 10485760 } }] };
    expect(vd({ ...invoice, peppol: invalid }), JSON.stringify(vd.errors)).toBe(true);
    expect(vd({ ...invoice, peppol: { ...invalid, skippedAttachments: 'zmluva.docx' } })).toBe(false);
    expect(vd({ ...invoice, peppol: { ...invalid, errors: [{ ...invalid.errors[0], params: 'big' }] } })).toBe(false);
  });

  it('knows every document kind of the specification', () => {
    ['INVOICE', 'PROFORMA', 'ADVANCE_TAX_DOC', 'CREDIT_NOTE', 'DEBIT_NOTE', 'QUOTE', 'RECEIVED_INVOICE', 'EXPENSE_RECEIPT', 'REMINDER', 'SELF_BILLING']
      .forEach(k => expect(DOCUMENT_KINDS).toContain(k));
  });
});
