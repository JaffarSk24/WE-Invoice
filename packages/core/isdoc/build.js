// ISDOC 6.0.2 writer (the Czech e-invoice standard, the format Czech
// customers and suppliers read; Peppol is not required in Czechia). The
// element order follows isdoc-invoice-6.0.2.xsd and the output validates
// against it. The local currency of a Slovak seller is EUR; a document in
// another currency carries the *Curr amounts in that currency and the
// base amounts in EUR, with CurrRate 1 and RefCurrRate the ECB quote the
// document stores (units of the currency per 1 EUR).
import { el, leaf, serializeXml } from '../exports/xml.js';
import { documentTotals } from '../exports/period.js';
import { div, round, mul, add, isZero } from '../money/index.js';
import { CoreError } from '../errors.js';
import { ISDOC_NS, ISDOC_VERSION, DOCUMENT_TYPES, PAYMENT_MEANS } from './codes.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function splitStreet(street) {
  const m = /^(.*\D)\s+(\d[\w/-]*)$/.exec(String(street || '').trim());
  return m ? { name: m[1].trim(), number: m[2] } : { name: String(street || '').trim(), number: '' };
}

function party(p, wrapper) {
  const a = p.address || {};
  const s = splitStreet(a.street);
  const vatId = p.icDph || p.dic;
  return el(wrapper, null, el('Party', null,
    el('PartyIdentification', null, el('ID', null, p.ico || '')),
    el('PartyName', null, el('Name', null, p.name || '')),
    el('PostalAddress', null,
      el('StreetName', null, s.name), el('BuildingNumber', null, s.number), el('CityName', null, a.city || ''),
      el('PostalZone', null, a.zip || ''), el('Country', null, el('IdentificationCode', null, a.country || ''), el('Name', null, ''))),
    vatId ? el('PartyTaxScheme', null, leaf('CompanyID', vatId), leaf('TaxScheme', 'VAT')) : null,
    p.phone || p.email ? el('Contact', null, leaf('Telephone', p.phone), leaf('ElectronicMail', p.email)) : null));
}

/**
 * @param {object} document  a document of the data model
 * @param {{company?: object, documents?: Map<string, object>|object[], now?: string}} [ctx]
 *   documents: to name the corrected document of a credit or debit note
 * @returns {string} ISDOC XML
 */
export function buildIsdoc(document, ctx = {}) {
  const type = DOCUMENT_TYPES[document.kind];
  if (!type) throw new CoreError('ISDOC_KIND_UNSUPPORTED', `no ISDOC type for ${document.kind}`);
  if (!document.number) throw new CoreError('ISDOC_NUMBER_REQUIRED', 'the document has no number');
  const totals = documentTotals(document);
  const foreign = document.currency && document.currency !== 'EUR' && document.fxRate;
  const local = (amount) => (foreign ? round(div(amount, document.fxRate, 10), 2) : round(amount, 2));
  // [base element in EUR, the same in the document currency when foreign]
  const money = (name, amount) => [leaf(name, local(amount)), foreign ? leaf(`${name}Curr`, round(amount, 2)) : null];
  const moneyCurrFirst = (name, amount) => [foreign ? leaf(`${name}Curr`, round(amount, 2)) : null, leaf(name, local(amount))];
  const seller = document.seller || {};
  const vatPayer = seller.vatPayer !== false && Boolean(seller.icDph);
  const source = (document.lines || []).filter(l => !l.kind || l.kind === 'ITEM');

  const lines = totals.lines.map((a, i) => {
    const line = source[i] || {};
    const rate = a.rate ?? '0';
    const unitGross = round(mul(a.unitNet, add('1', div(rate, '100', 6))), 4);
    return el('InvoiceLine', null,
      leaf('ID', String(i + 1)),
      el('InvoicedQuantity', line.unit && line.unit.code ? { unitCode: line.unit.code } : null, line.qty || '1'),
      moneyCurrFirst('LineExtensionAmount', a.net),
      a.allowance && !isZero(a.allowance) ? leaf('LineExtensionAmountBeforeDiscount', local(a.gross)) : null,
      moneyCurrFirst('LineExtensionAmountTaxInclusive', a.total),
      leaf('LineExtensionTaxAmount', local(a.vat)),
      leaf('UnitPrice', foreign ? round(div(a.unitNet, document.fxRate, 10), 4) : a.unitNet),
      leaf('UnitPriceTaxInclusive', foreign ? round(div(unitGross, document.fxRate, 10), 4) : unitGross),
      el('ClassifiedTaxCategory', null, leaf('Percent', rate), leaf('VATCalculationMethod', '0'), leaf('VATApplicable', a.category === 'S' ? 'true' : 'false')),
      leaf('Note', line.description),
      el('Item', null, leaf('Description', line.name), leaf('SellersItemIdentification', null)));
  });

  const subtotals = (totals.breakdown || []).map(b => el('TaxSubTotal', null,
    moneyCurrFirst('TaxableAmount', b.base),
    moneyCurrFirst('TaxAmount', b.vat),
    moneyCurrFirst('TaxInclusiveAmount', add(b.base, b.vat)),
    moneyCurrFirst('AlreadyClaimedTaxableAmount', '0'),
    moneyCurrFirst('AlreadyClaimedTaxAmount', '0'),
    moneyCurrFirst('AlreadyClaimedTaxInclusiveAmount', '0'),
    moneyCurrFirst('DifferenceTaxableAmount', b.base),
    moneyCurrFirst('DifferenceTaxAmount', b.vat),
    moneyCurrFirst('DifferenceTaxInclusiveAmount', add(b.base, b.vat)),
    el('TaxCategory', null, leaf('Percent', b.rate ?? '0'), leaf('VATApplicable', b.category === 'S' ? 'true' : 'false'))));

  const corrected = correctedDocument(document, ctx.documents);
  const account = bankAccount(document, ctx.company);
  const means = PAYMENT_MEANS[document.paymentMethod] || '42';
  const details = means === '42' && account && document.dueDate ? el('Details', null,
    leaf('PaymentDueDate', document.dueDate),
    el('ID', null, account.id), el('BankCode', null, account.bankCode), el('Name', null, account.name || ''),
    el('IBAN', null, account.iban), el('BIC', null, account.bic || ''),
    leaf('VariableSymbol', document.vs), leaf('ConstantSymbol', document.ks), leaf('SpecificSymbol', document.ss)) : null;

  const root = el('Invoice', { xmlns: ISDOC_NS, version: ISDOC_VERSION },
    leaf('DocumentType', type),
    leaf('ID', document.number),
    leaf('UUID', documentUuid(document)),
    leaf('IssuingSystem', 'WE Invoice'),
    leaf('IssueDate', document.issueDate),
    leaf('TaxPointDate', document.taxDate),
    leaf('VATApplicable', vatPayer ? 'true' : 'false'),
    el('ElectronicPossibilityAgreementReference', null),
    leaf('Note', document.textIntro),
    leaf('LocalCurrencyCode', 'EUR'),
    foreign ? leaf('ForeignCurrencyCode', document.currency) : null,
    leaf('CurrRate', '1'),
    leaf('RefCurrRate', foreign ? document.fxRate : '1'),
    party(seller, 'AccountingSupplierParty'),
    party(document.buyer || {}, 'AccountingCustomerParty'),
    corrected ? el('OriginalDocumentReferences', null, el('OriginalDocumentReference', null,
      leaf('ID', corrected.number), leaf('IssueDate', corrected.issueDate))) : null,
    el('InvoiceLines', null, lines),
    el('TaxTotal', null, subtotals, moneyCurrFirst('TaxAmount', totals.vat)),
    el('LegalMonetaryTotal', null,
      money('TaxExclusiveAmount', totals.net),
      money('TaxInclusiveAmount', totals.gross),
      money('AlreadyClaimedTaxExclusiveAmount', '0'),
      money('AlreadyClaimedTaxInclusiveAmount', '0'),
      money('DifferenceTaxExclusiveAmount', totals.net),
      money('DifferenceTaxInclusiveAmount', totals.gross),
      totals.rounding && totals.rounding !== '0.00' ? money('PayableRoundingAmount', totals.rounding) : null,
      money('PaidDepositsAmount', totals.prepaid || '0'),
      money('PayableAmount', totals.payable)),
    el('PaymentMeans', null, el('Payment', null, leaf('PaidAmount', local(totals.payable)), leaf('PaymentMeansCode', means), details)));
  return serializeXml(root);
}

// The record id when it is a UUID (ids are UUIDv7); otherwise a stable
// UUID-shaped value derived from it, so a repeated export keeps its UUID.
export function documentUuid(document) {
  const id = String(document.id || document.number || '');
  if (UUID.test(id)) return id.toUpperCase();
  let hex = '';
  for (const seed of [0x811c9dc5, 0x01000193, 0x050c5d1f, 0x2f6b8a3d]) {
    let h = seed;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
    hex += h.toString(16).padStart(8, '0');
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`.toUpperCase();
}

function correctedDocument(document, documents) {
  const link = (document.links || []).find(l => l.kind === 'CORRECTS');
  if (!link) return null;
  const list = documents instanceof Map ? [...documents.values()] : documents || [];
  return list.find(d => d.id === link.docId) || null;
}

// The account the document is paid to: the one it names, else the
// company's default. ID and BankCode are the domestic form an ISDOC reader
// in Czechia or Slovakia expects next to the IBAN.
function bankAccount(document, company) {
  const accounts = (company && company.bankAccounts) || [];
  const chosen = accounts.find(a => a.id === document.bankAccountId) || accounts.find(a => a.isDefault) || accounts[0];
  if (!chosen || !chosen.iban) return null;
  const iban = chosen.iban.replace(/\s/g, '');
  const domestic = /^(SK|CZ)\d{2}(\d{4})(\d{6})(\d{10})$/.exec(iban);
  const id = domestic ? `${domestic[3].replace(/^0+/, '')}${domestic[3].replace(/^0+/, '') ? '-' : ''}${domestic[4].replace(/^0+/, '')}` : '';
  return { id, bankCode: domestic ? domestic[2] : '', name: chosen.name, iban, bic: chosen.bic };
}
