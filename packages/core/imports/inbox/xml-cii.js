// Minimal reader of UN/CEFACT Cross Industry Invoices (ZUGFeRD, Factur-X,
// XRechnung CII), the XML that German and French suppliers embed in their
// PDFs. Same field shape as the UBL reader.
import { parseAmount, round } from '../../money/index.js';
import { child, children, at, textAt } from './xml.js';
import { classifyId, normalizeId, normalizeIban } from './party.js';
import { symbolFrom } from './xml-ubl.js';

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

// Format 102 dates: "20261015" -> "2026-10-15".
const date = (node, path) => {
  const s = textAt(node, path);
  const m = s && /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/** Fields of a CrossIndustryInvoice. */
export function readCii(root) {
  const tx = child(root, 'SupplyChainTradeTransaction');
  const seller = at(tx, 'ApplicableHeaderTradeAgreement/SellerTradeParty');
  const settlement = child(tx, 'ApplicableHeaderTradeSettlement');
  const sums = child(settlement, 'SpecifiedTradeSettlementHeaderMonetarySummation');
  const means = child(settlement, 'SpecifiedTradeSettlementPaymentMeans');
  const addr = child(seller, 'PostalTradeAddress');
  const out = {
    kind: textAt(root, 'ExchangedDocument/TypeCode') === '381' ? 'RECEIVED_CREDIT_NOTE' : 'RECEIVED_INVOICE',
    number: textAt(root, 'ExchangedDocument/ID'),
    issueDate: date(root, 'ExchangedDocument/IssueDateTime/DateTimeString'),
    taxDate: date(tx, 'ApplicableHeaderTradeDelivery/ActualDeliverySupplyChainEvent/OccurrenceDateTime/DateTimeString'),
    dueDate: date(settlement, 'SpecifiedTradePaymentTerms/DueDateDateTime/DateTimeString'),
    currency: textAt(settlement, 'InvoiceCurrencyCode'),
    supplierName: textAt(seller, 'Name'),
    supplierAddress: addr ? {
      street: textAt(addr, 'LineOne') || '', city: textAt(addr, 'CityName') || '', zip: textAt(addr, 'PostcodeCode') || '',
      country: textAt(addr, 'CountryID') || 'SK'
    } : null,
    iban: normalizeIban(textAt(means, 'PayeePartyCreditorFinancialAccount/IBANID')),
    bic: textAt(means, 'PayeeSpecifiedCreditorFinancialInstitution/BICID'),
    vs: symbolFrom(textAt(settlement, 'PaymentReference')),
    net: amount(sums, 'TaxBasisTotalAmount'),
    vat: amount(sums, 'TaxTotalAmount'),
    total: amount(sums, 'DuePayableAmount') ?? amount(sums, 'GrandTotalAmount'),
    breakdown: children(settlement, 'ApplicableTradeTax').map(tax => ({
      category: textAt(tax, 'CategoryCode') || 'S',
      rate: number(tax, 'RateApplicablePercent') ?? '0',
      base: amount(tax, 'BasisAmount') ?? '0',
      vat: amount(tax, 'CalculatedAmount') ?? '0'
    })),
    lines: children(tx, 'IncludedSupplyChainTradeLineItem').map(line => ({
      name: textAt(line, 'SpecifiedTradeProduct/Name') || '',
      qty: number(line, 'SpecifiedLineTradeDelivery/BilledQuantity') ?? '1',
      unitCode: (at(line, 'SpecifiedLineTradeDelivery/BilledQuantity') || { attrs: {} }).attrs.unitCode || null,
      unitPrice: number(line, 'SpecifiedLineTradeAgreement/NetPriceProductTradePrice/ChargeAmount') ?? '0',
      net: amount(line, 'SpecifiedLineTradeSettlement/SpecifiedTradeSettlementLineMonetarySummation/LineTotalAmount'),
      vatCategory: textAt(line, 'SpecifiedLineTradeSettlement/ApplicableTradeTax/CategoryCode') || 'S',
      vatRate: number(line, 'SpecifiedLineTradeSettlement/ApplicableTradeTax/RateApplicablePercent')
    })),
    attachments: []
  };
  const ids = [textAt(seller, 'SpecifiedLegalOrganization/ID'), ...children(seller, 'SpecifiedTaxRegistration').map(r => textAt(r, 'ID'))];
  for (const value of ids.filter(Boolean)) {
    const kind = classifyId(value);
    if (kind && !out[kind]) out[kind] = normalizeId(kind, value);
  }
  return out;
}
