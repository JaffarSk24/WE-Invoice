// The e-invoice decision of 04-peppol.md § 4.5 with the owner's rule that
// the duty is Slovak only: a seller outside Slovakia is never obliged.
import { describe, it, expect } from 'vitest';
import { peppolRequirement } from './index.js';

const company = (over = {}) => ({ name: 'S', vatMode: 'PAYER', address: { country: 'SK' }, ...over });
const contact = (over = {}) => ({ id: 'c', kind: 'COMPANY', name: 'B', ico: '36835587', dic: '2020123457', icDph: 'SK2020123457', country: 'SK', ...over });
const invoice = (over = {}) => ({ kind: 'INVOICE', taxDate: '2027-03-01', issueDate: '2027-03-01', lines: [{ id: 'l', name: 'a', qty: '1', unitPrice: '1', vatCategory: 'S', vatRate: '23' }], ...over });
const TODAY = '2027-03-05';

describe('peppolRequirement', () => {
  it('Slovak payer to a Slovak business from 2027 is MANDATORY with the deadline', () => {
    expect(peppolRequirement(company(), contact(), invoice(), TODAY)).toEqual({
      requirement: 'MANDATORY', reason: 'peppol.reason.payerB2bDomestic', deadline: '2027-03-16', daysLeft: 11
    });
    expect(peppolRequirement(company(), contact(), invoice({ taxDate: '2027-01-01' }), '2027-01-20').daysLeft).toBe(-4);
  });

  it('credit and debit notes and advance tax documents follow the same duty', () => {
    for (const kind of ['CREDIT_NOTE', 'DEBIT_NOTE', 'ADVANCE_TAX_DOC', 'SELF_BILLING']) {
      expect(peppolRequirement(company(), contact(), invoice({ kind }), TODAY).requirement).toBe('MANDATORY');
    }
  });

  it('a supply from before the e-invoicing law is OPTIONAL, not an error', () => {
    expect(peppolRequirement(company(), contact(), invoice({ taxDate: '2025-06-30', issueDate: '2025-06-30' }), '2026-10-18'))
      .toEqual({ requirement: 'OPTIONAL', reason: 'peppol.reason.beforeMandatoryDate' });
  });

  it('before 1 January 2027 it is OPTIONAL', () => {
    expect(peppolRequirement(company(), contact(), invoice({ taxDate: '2026-12-31', issueDate: '2026-12-31' }), '2026-12-31'))
      .toEqual({ requirement: 'OPTIONAL', reason: 'peppol.reason.beforeMandatoryDate' });
    expect(peppolRequirement(company(), contact(), invoice({ taxDate: '2027-01-01' }), '2027-01-01').requirement).toBe('MANDATORY');
  });

  it('uses the delivery date, then the issue date, then today when the tax date is missing', () => {
    expect(peppolRequirement(company(), contact(), invoice({ taxDate: null, deliveryDate: '2026-12-31', issueDate: '2027-01-02' }), TODAY).requirement).toBe('OPTIONAL');
    expect(peppolRequirement(company(), contact(), invoice({ taxDate: null, issueDate: '2026-12-31' }), TODAY).requirement).toBe('OPTIONAL');
    expect(peppolRequirement(company(), contact(), invoice({ taxDate: null, issueDate: null }), '2026-06-01').requirement).toBe('OPTIONAL');
    expect(peppolRequirement(company(), contact(), invoice({ taxDate: null, issueDate: null }), TODAY).requirement).toBe('MANDATORY');
  });

  it('non-tax documents are NOT_APPLICABLE', () => {
    for (const kind of ['PROFORMA', 'QUOTE', 'DELIVERY_NOTE', 'ORDER_IN', 'REMINDER', 'CASH_IN']) {
      expect(peppolRequirement(company(), contact(), invoice({ kind }), TODAY)).toEqual({ requirement: 'NOT_APPLICABLE', reason: 'peppol.reason.nonTaxDocument' });
    }
    expect(peppolRequirement(company(), contact(), invoice({ kind: 'SALES_RECEIPT' }), TODAY)).toEqual({ requirement: 'NOT_APPLICABLE', reason: 'peppol.reason.simplifiedInvoice' });
  });

  it('a classified supply is NOT_ALLOWED', () => {
    expect(peppolRequirement(company(), contact(), invoice({ classified: true }), TODAY)).toEqual({ requirement: 'NOT_ALLOWED', reason: 'peppol.reason.classified' });
  });

  it('a non-payer seller is OPTIONAL', () => {
    expect(peppolRequirement(company({ vatMode: 'NONPAYER' }), contact(), invoice(), TODAY)).toEqual({ requirement: 'OPTIONAL', reason: 'peppol.reason.sellerNotPayer' });
    expect(peppolRequirement(company({ vatMode: 'REGISTERED_7' }), contact(), invoice(), TODAY).reason).toBe('peppol.reason.sellerNotPayer');
  });

  it('a consumer buyer is OPTIONAL', () => {
    expect(peppolRequirement(company(), contact({ kind: 'PERSON', ico: null, dic: null, icDph: null }), invoice(), TODAY)).toEqual({ requirement: 'OPTIONAL', reason: 'peppol.reason.b2c' });
    expect(peppolRequirement(company(), null, invoice(), TODAY).reason).toBe('peppol.reason.b2c');
    expect(peppolRequirement(company(), null, invoice({ buyer: { name: 'X', ico: '36835587', address: { country: 'SK' } } }), TODAY).requirement).toBe('MANDATORY');
    expect(peppolRequirement(company(), contact({ kind: 'PERSON', ico: '36835587', dic: null, icDph: null }), invoice(), TODAY).requirement).toBe('MANDATORY');
  });

  it('a Slovak payer with a Czech buyer is OPTIONAL (not a domestic supply)', () => {
    expect(peppolRequirement(company(), contact({ country: 'CZ', icDph: 'CZ12345679', dic: null }), invoice(), TODAY))
      .toEqual({ requirement: 'OPTIONAL', reason: 'peppol.reason.foreignBuyer' });
    expect(peppolRequirement(company(), contact({ country: null, billingAddress: { country: 'DE' } }), invoice(), TODAY).reason).toBe('peppol.reason.foreignBuyer');
  });

  it('a Czech seller with a Slovak buyer is never MANDATORY', () => {
    const cz = company({ address: { country: 'CZ' } });
    expect(peppolRequirement(cz, contact(), invoice(), TODAY)).toEqual({ requirement: 'NOT_APPLICABLE', reason: 'peppol.reason.sellerOutsideSk' });
    expect(peppolRequirement(cz, contact({ peppolId: '0245:2020123457' }), invoice(), TODAY)).toEqual({ requirement: 'OPTIONAL', reason: 'peppol.reason.sellerOutsideSk' });
  });

  it('a Czech seller with a Czech buyer is never MANDATORY', () => {
    const cz = company({ address: { country: 'CZ' } });
    const buyer = contact({ country: 'CZ', icDph: 'CZ12345679', dic: null });
    expect(peppolRequirement(cz, buyer, invoice(), TODAY)).toEqual({ requirement: 'NOT_APPLICABLE', reason: 'peppol.reason.sellerOutsideSk' });
    expect(peppolRequirement(cz, { ...buyer, peppolId: '9923:CZ12345679' }, invoice(), TODAY).requirement).toBe('OPTIONAL');
    expect(peppolRequirement(cz, null, invoice({ buyer: { name: 'X', peppolId: '9923:CZ12345679' } }), TODAY).requirement).toBe('OPTIONAL');
  });

  it('a seller without an address is treated as Slovak', () => {
    expect(peppolRequirement(company({ address: undefined }), contact(), invoice(), TODAY).requirement).toBe('MANDATORY');
  });

  it('a wholly exempt supply is OPTIONAL, a mixed one MANDATORY', () => {
    const exempt = [{ id: 'l', name: 'a', qty: '1', unitPrice: '1', vatCategory: 'E', exemptionReasonCode: 'VATEX-EU-132' }];
    expect(peppolRequirement(company(), contact(), invoice({ lines: exempt }), TODAY)).toEqual({ requirement: 'OPTIONAL', reason: 'peppol.reason.exemptSupply' });
    expect(peppolRequirement(company(), contact(), invoice({ lines: [...exempt, ...invoice().lines] }), TODAY).requirement).toBe('MANDATORY');
    expect(peppolRequirement(company(), contact(), invoice({ lines: [{ id: 'g', name: 'a', qty: '1', unitPrice: '1', vatCategory: 'G' }] }), TODAY).reason).toBe('peppol.reason.exemptSupply');
    expect(peppolRequirement(company(), contact(), invoice({ lines: [] }), TODAY).requirement).toBe('MANDATORY');
  });
});
