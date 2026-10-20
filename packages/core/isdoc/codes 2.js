// ISDOC 6.0.2 code lists shared by the writer and the reader: document
// types (1 invoice, 2 credit note, 3 debit note, 4 advance invoice without
// tax, 5 tax document to a received advance, 6 corrective tax document to
// an advance, 7 simplified tax document) and payment means.

export const ISDOC_NS = 'http://isdoc.cz/namespace/2013';
export const ISDOC_VERSION = '6.0.2';

export const DOCUMENT_TYPES = Object.freeze({
  INVOICE: '1', SELF_BILLING: '1', RECEIVED_INVOICE: '1',
  CREDIT_NOTE: '2', RECEIVED_CREDIT_NOTE: '2',
  DEBIT_NOTE: '3',
  PROFORMA: '4',
  ADVANCE_TAX_DOC: '5',
  SALES_RECEIPT: '7', EXPENSE_RECEIPT: '7'
});

// Kinds a document type becomes, for documents we issued (OUT) and
// documents we received (IN).
export const KINDS_BY_TYPE = Object.freeze({
  OUT: { 1: 'INVOICE', 2: 'CREDIT_NOTE', 3: 'DEBIT_NOTE', 4: 'PROFORMA', 5: 'ADVANCE_TAX_DOC', 6: 'CREDIT_NOTE', 7: 'SALES_RECEIPT' },
  IN: { 1: 'RECEIVED_INVOICE', 2: 'RECEIVED_CREDIT_NOTE', 3: 'RECEIVED_INVOICE', 4: 'RECEIVED_INVOICE', 5: 'RECEIVED_INVOICE', 6: 'RECEIVED_CREDIT_NOTE', 7: 'EXPENSE_RECEIPT' }
});

export const PAYMENT_MEANS = Object.freeze({ CASH: '10', CARD: '48', TRANSFER: '42', COD: '50', OFFSET: '97', ONLINE: '31', QR_ON_SITE: '42' });
export const METHODS_BY_MEANS = Object.freeze({ 10: 'CASH', 20: 'TRANSFER', 31: 'ONLINE', 42: 'TRANSFER', 48: 'CARD', 49: 'TRANSFER', 50: 'COD', 97: 'OFFSET' });
