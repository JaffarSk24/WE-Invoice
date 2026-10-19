// One test per rule of sk-rules.json: the rule fires on a document that
// breaks it and stays quiet on the base document.
import { describe, it, expect } from 'vitest';
import skRules from './sk-rules.json' with { type: 'json' };
import { buildUbl, validateUblLocal, hasBlockingIssues } from './index.js';

const company = {
  name: 'Alfa s.r.o.', ico: '35000007', dic: '2020000004', icDph: 'SK2020000004', vatMode: 'PAYER',
  registerEntry: 'OR MS Bratislava III, Sro 1/B', address: { country: 'SK' },
  bankAccounts: [{ id: 'a', iban: 'SK3112000000198742637541', currency: 'EUR', isDefault: true }]
};
const buyer = { name: 'Beta a.s.', dic: '2020000026', icDph: 'SK2020000026', address: { country: 'SK' } };
const line = (fields = {}) => ({ id: 'l', name: 'a', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23', ...fields });
const base = (fields = {}) => ({
  kind: 'INVOICE', number: 'FA1', issueDate: '2027-01-15', taxDate: '2027-01-15', dueDate: '2027-01-29', currency: 'EUR', buyer, lines: [line()], ...fields
});
const codes = (doc, comp = company, options = {}) => validateUblLocal(doc, comp, options).map(i => i.code);

// Breaking document (and options) per rule code.
const BREAKS = {
  NUMBER_MISSING: () => [base({ number: null })],
  ISSUE_DATE_MISSING: () => [base({ issueDate: null })],
  TYPE_CODE_NOT_ALLOWED: () => [base({ kind: 'QUOTE' })],
  SELLER_DIC_MISSING: () => [base(), { ...company, dic: '123' }],
  BUYER_ENDPOINT_MISSING: () => [base({ buyer: { name: 'X', address: { country: 'SK' } } })],
  EXEMPTION_REASON_FORBIDDEN: () => [base({ lines: [line({ exemptionReasonCode: 'VATEX-EU-132' })] })],
  EXEMPTION_REASON_DEFAULTED: () => [base({ lines: [line({ vatCategory: 'E', vatRate: null })] })],
  REVERSE_CHARGE_NOTE: null,
  CASH_BASIS_NOTE: null,
  SELLER_REGISTER_ENTRY_MISSING: () => [base(), { ...company, registerEntry: null }],
  PRECEDING_INVOICE_MISSING: () => [base({ kind: 'CREDIT_NOTE' })],
  FX_RATE_MISSING: () => [base({ currency: 'USD' })],
  SELLER_VAT_ID_MISSING: () => [base(), { ...company, icDph: null }],
  BUYER_VAT_ID_MISSING: () => [base({ buyer: { ...buyer, icDph: null }, lines: [line({ vatCategory: 'AE', vatRate: null })] })],
  NOT_SUBJECT_MIXED: () => [base({ lines: [line(), line({ id: 'm', vatCategory: 'O', vatRate: null })] })],
  DUE_DATE_MISSING: () => [base({ dueDate: null })],
  CLASSIFIED_SUPPLY: () => [base({ classified: true })],
  ATTACHMENT_TOO_LARGE: () => [base(), company, { pdf: { base64: 'A'.repeat(4000) }, maxAttachmentBytes: 1000 }],
  NO_LINES: () => [base({ lines: [{ id: 't', kind: 'TEXT', name: 'x', qty: '0', unitPrice: '0', vatCategory: 'S' }] })]
};

describe('Slovak rules (sk-rules.json)', () => {
  it('the base document passes every rule', () => {
    expect(validateUblLocal(base(), company)).toEqual([]);
  });

  it('every rule has a test here', () => {
    expect(Object.keys(BREAKS).sort()).toEqual(skRules.rules.map(r => r.code).sort());
  });

  it.each(skRules.rules.filter(r => BREAKS[r.code]).map(r => [r.id, r.code]))('%s %s fires', (_id, code) => {
    const [doc, comp, options] = BREAKS[code]();
    expect(codes(doc, comp, options)).toContain(code);
  });

  it('SK-08 the reverse charge text is written for AE', () => {
    const xml = buildUbl(base({ lines: [line({ vatCategory: 'AE', vatRate: null })] }), company);
    expect(xml).toContain('<cbc:Note>prenesenie daňovej povinnosti</cbc:Note>');
    expect(xml).toContain('<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>');
  });

  it('SK-09 the cash accounting text is written for a § 68d seller', () => {
    expect(buildUbl(base(), { ...company, cashBasis: true })).toContain('<cbc:Note>uplatňovanie DPH na základe prijatia platby</cbc:Note>');
  });

  it('SK-06 a reason on S or Z is left out of the XML', () => {
    expect(buildUbl(base({ lines: [line({ exemptionReasonCode: 'VATEX-EU-132' })] }), company)).not.toContain('TaxExemptionReason');
  });

  it('SK-18 a large PDF is left out, a small one is attached, the setting can turn it off', () => {
    const pdf = { base64: 'JVBERi0xLjQK', name: 'a.pdf' };
    expect(buildUbl(base(), company, { pdf, maxAttachmentBytes: 2 })).not.toContain('EmbeddedDocumentBinaryObject');
    expect(buildUbl(base(), company, { pdf })).toContain('mimeCode="application/pdf" filename="a.pdf"');
    expect(buildUbl(base(), { ...company, defaults: { attachPdfToEInvoice: false } }, { pdf })).not.toContain('Embedded');
  });

  it('warnings do not block, errors do', () => {
    expect(hasBlockingIssues(validateUblLocal(base(), { ...company, registerEntry: null }))).toBe(false);
    expect(hasBlockingIssues(validateUblLocal(base({ dueDate: null }), company))).toBe(true);
  });

  it('buildUbl refuses a blocked document with the issues in the error', () => {
    expect(() => buildUbl(base({ buyer: { name: 'X' } }), company)).toThrow(expect.objectContaining({
      code: 'UBL_INVALID', details: { issues: expect.arrayContaining([expect.objectContaining({ code: 'BUYER_ENDPOINT_MISSING', bt: 'BT-49' })]) }
    }));
  });

  it('uses the buyer Peppol id for a foreign buyer and the DIČ for the seller', () => {
    const xml = buildUbl(base({ buyer: { name: 'AT', icDph: 'ATU12345675', peppolId: '9914:ATU12345675', address: { country: 'AT' } }, lines: [line({ vatCategory: 'K', vatRate: null })] }), company);
    expect(xml).toContain('<cbc:EndpointID schemeID="9914">ATU12345675</cbc:EndpointID>');
    expect(xml).toContain('<cbc:EndpointID schemeID="0245">2020000004</cbc:EndpointID>');
  });

  it('the tax document to a payment uses type code 388', () => {
    expect(buildUbl(base({ kind: 'ADVANCE_TAX_DOC' }), company)).toContain('<cbc:InvoiceTypeCode>388</cbc:InvoiceTypeCode>');
  });
});
