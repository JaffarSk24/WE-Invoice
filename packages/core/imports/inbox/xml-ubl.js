// Minimal readers of received UBL 2.1 (Peppol BIS 3) and ISDOC 6 invoices
// for the Inbox: the supplier, numbers, dates, payment details, VAT
// breakdown and lines. The full parsers belong to WP-PEPPOL (parseUbl)
// and WP-EXIM (parseIsdoc); recognize.js prefers them when they exist and
// falls back to these readers otherwise.
import { parseAmount, round } from '../../money/index.js';
import { child, children, at, textAt } from './xml.js';
import { classifyId, normalizeId, normalizeIban } from './party.js';

const amount = (node, path) => {
  const s = textAt(node, path);
  const value = s === null ? null : parseAmount(s);
  return value === null ? null : round(value, 2);
};

// Rates and quantities keep their own precision ("23", "42.15").
const number = (node, path) => {
  const s = textAt(node, path);
  return s === null ? null : parseAmount(s);
};

const date = (node, path) => {
  const s = textAt(node, path);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

// Digits of a payment reference: "VS20260012" or "20260012" -> "20260012".
export function symbolFrom(value) {
  const digits = String(value ?? '').replace(/^\s*(VS|KS|SS)\s*[:.]?/i, '').trim();
  return /^\d{1,10}$/.test(digits) ? digits : null;
}

function putIds(out, values) {
  for (const value of values) {
    const kind = classifyId(value);
    if (kind && !out[kind]) out[kind] = normalizeId(kind, value);
  }
}

function address(node) {
  if (!node) return null;
  const street = [textAt(node, 'StreetName'), textAt(node, 'BuildingNumber')].filter(Boolean).join(' ');
  const country = textAt(node, 'Country/IdentificationCode');
  const result = { street, city: textAt(node, 'CityName') || '', zip: textAt(node, 'PostalZone') || '', country: country || 'SK' };
  return result.street || result.city ? result : null;
}

function ublParty(party) {
  const out = {
    supplierName: textAt(party, 'PartyName/Name') || textAt(party, 'PartyLegalEntity/RegistrationName'),
    supplierAddress: address(child(party, 'PostalAddress'))
  };
  putIds(out, [
    textAt(party, 'PartyLegalEntity/CompanyID'),
    ...children(party, 'PartyIdentification').map(p => textAt(p, 'ID')),
    ...children(party, 'PartyTaxScheme').map(p => textAt(p, 'CompanyID')),
    textAt(party, 'EndpointID')
  ].filter(Boolean));
  return out;
}

function breakdownOf(taxTotals, subName) {
  const rows = [];
  for (const total of taxTotals) {
    for (const sub of children(total, subName)) {
      const category = textAt(sub, 'TaxCategory/ID') || 'S';
      rows.push({
        category: category === 'VAT' ? 'S' : category,
        rate: number(sub, 'TaxCategory/Percent') ?? number(sub, 'Percent') ?? '0',
        base: amount(sub, 'TaxableAmount') ?? '0',
        vat: amount(sub, 'TaxAmount') ?? '0'
      });
    }
  }
  return rows;
}

/** Fields of a UBL Invoice or CreditNote. */
export function readUbl(root) {
  const credit = root.name === 'CreditNote' || textAt(root, 'InvoiceTypeCode') === '381';
  const supplier = at(root, 'AccountingSupplierParty/Party');
  const means = child(root, 'PaymentMeans');
  const lineName = root.name === 'CreditNote' ? 'CreditNoteLine' : 'InvoiceLine';
  const qtyName = root.name === 'CreditNote' ? 'CreditedQuantity' : 'InvoicedQuantity';
  const taxTotals = children(root, 'TaxTotal').filter(t => child(t, 'TaxSubtotal'));
  return {
    kind: credit ? 'RECEIVED_CREDIT_NOTE' : 'RECEIVED_INVOICE',
    number: textAt(root, 'ID'),
    issueDate: date(root, 'IssueDate'),
    taxDate: date(root, 'TaxPointDate') || date(root, 'Delivery/ActualDeliveryDate'),
    dueDate: date(root, 'DueDate') || date(means, 'PaymentDueDate'),
    currency: textAt(root, 'DocumentCurrencyCode'),
    ...(supplier ? ublParty(supplier) : {}),
    iban: normalizeIban(textAt(means, 'PayeeFinancialAccount/ID')),
    bic: textAt(means, 'PayeeFinancialAccount/FinancialInstitutionBranch/ID'),
    vs: symbolFrom(textAt(means, 'PaymentID')),
    net: amount(root, 'LegalMonetaryTotal/TaxExclusiveAmount'),
    vat: amount(taxTotals[0] || child(root, 'TaxTotal'), 'TaxAmount'),
    total: amount(root, 'LegalMonetaryTotal/PayableAmount') ?? amount(root, 'LegalMonetaryTotal/TaxInclusiveAmount'),
    breakdown: breakdownOf(taxTotals, 'TaxSubtotal'),
    lines: children(root, lineName).map(line => ({
      name: textAt(line, 'Item/Name') || textAt(line, 'Item/Description') || '',
      qty: number(line, qtyName) ?? '1',
      unitCode: (child(line, qtyName) || { attrs: {} }).attrs.unitCode || null,
      unitPrice: number(line, 'Price/PriceAmount') ?? amount(line, 'LineExtensionAmount') ?? '0',
      net: amount(line, 'LineExtensionAmount'),
      vatCategory: textAt(line, 'Item/ClassifiedTaxCategory/ID') || 'S',
      vatRate: number(line, 'Item/ClassifiedTaxCategory/Percent')
    })),
    attachments: children(root, 'AdditionalDocumentReference').map(ref => {
      const obj = at(ref, 'Attachment/EmbeddedDocumentBinaryObject');
      return obj ? { name: obj.attrs.filename || textAt(ref, 'ID') || 'attachment', mime: obj.attrs.mimeCode || 'application/octet-stream', base64: obj.text.trim() } : null;
    }).filter(Boolean)
  };
}

const zeroRate = (rate) => rate === null || !/[1-9]/.test(rate);

// ISDOC document types: 1 invoice, 2 credit note, 3 debit note, 4 advance.
const ISDOC_KINDS = { 1: 'RECEIVED_INVOICE', 2: 'RECEIVED_CREDIT_NOTE', 3: 'RECEIVED_INVOICE', 4: 'RECEIVED_INVOICE' };

function isdocParty(party) {
  const out = { supplierName: textAt(party, 'PartyName/Name'), supplierAddress: address(child(party, 'PostalAddress')) };
  putIds(out, [textAt(party, 'PartyIdentification/ID'), ...children(party, 'PartyTaxScheme').map(p => textAt(p, 'CompanyID'))].filter(Boolean));
  return out;
}

/** Fields of an ISDOC Invoice. */
export function readIsdoc(root) {
  const details = at(root, 'PaymentMeans/Payment/Details');
  const foreign = textAt(root, 'ForeignCurrencyCode');
  return {
    kind: ISDOC_KINDS[textAt(root, 'DocumentType')] || 'RECEIVED_INVOICE',
    number: textAt(root, 'ID'),
    issueDate: date(root, 'IssueDate'),
    taxDate: date(root, 'TaxPointDate'),
    dueDate: date(details, 'PaymentDueDate'),
    currency: foreign || textAt(root, 'LocalCurrencyCode'),
    ...isdocParty(at(root, 'AccountingSupplierParty/Party')),
    iban: normalizeIban(textAt(details, 'IBAN')),
    bic: textAt(details, 'BIC'),
    vs: symbolFrom(textAt(details, 'VariableSymbol')),
    ks: symbolFrom(textAt(details, 'ConstantSymbol')),
    ss: symbolFrom(textAt(details, 'SpecificSymbol')),
    net: amount(root, 'LegalMonetaryTotal/TaxExclusiveAmount'),
    vat: amount(root, 'TaxTotal/TaxAmount'),
    total: amount(root, 'LegalMonetaryTotal/PayableAmount') ?? amount(root, 'LegalMonetaryTotal/TaxInclusiveAmount'),
    breakdown: children(child(root, 'TaxTotal'), 'TaxSubTotal').map(sub => ({
      category: zeroRate(number(sub, 'TaxCategory/Percent')) ? 'E' : 'S', rate: number(sub, 'TaxCategory/Percent') ?? '0', base: amount(sub, 'TaxableAmount') ?? '0', vat: amount(sub, 'TaxAmount') ?? '0'
    })),
    lines: children(child(root, 'InvoiceLines'), 'InvoiceLine').map(line => ({
      name: textAt(line, 'Item/Description') || '',
      qty: number(line, 'InvoicedQuantity') ?? '1',
      unitCode: (child(line, 'InvoicedQuantity') || { attrs: {} }).attrs.unitCode || null,
      unitPrice: number(line, 'UnitPrice') ?? amount(line, 'LineExtensionAmount') ?? '0',
      net: amount(line, 'LineExtensionAmount'),
      vatCategory: zeroRate(number(line, 'ClassifiedTaxCategory/Percent')) ? 'E' : 'S',
      vatRate: number(line, 'ClassifiedTaxCategory/Percent')
    })),
    attachments: []
  };
}
