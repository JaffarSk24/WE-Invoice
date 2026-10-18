// Reads a received UBL Invoice or CreditNote (Peppol BIS 3) back into a
// document of the data model (04-peppol.md § 4.7). The amounts stated in
// the XML are kept as the document's totals; the document is then
// recomputed with computeTotals() and any difference is reported as a
// warning, never "fixed" and never a reason to reject the document.
import { CoreError } from '../errors.js';
import { computeTotals } from '../vat/index.js';
import { sub, mul, div, round, cmp, isZero, sum } from '../money/index.js';
import { uuidv7 } from '../ids/uuid.js';
import { parseXml, child, children, text } from './xml-parse.js';
import { kindOfTypeCode, methodOfPaymentCode, SK_SCHEME } from './codes.js';
import { readParty } from './parse-party.js';

const DECIMAL = /^-?\d+(\.\d+)?$/;
const RECEIVED = { INVOICE: 'RECEIVED_INVOICE', CREDIT_NOTE: 'RECEIVED_CREDIT_NOTE' };

function decimal(value, field, required = false) {
  if (value === null || value === undefined) {
    if (required) throw new CoreError('UBL_REQUIRED_MISSING', `missing ${field}`, { field });
    return null;
  }
  if (!DECIMAL.test(value)) throw new CoreError('UBL_AMOUNT_INVALID', `${field} is not a decimal: ${value}`, { field });
  return value;
}

function required(value, field) {
  if (!value) throw new CoreError('UBL_REQUIRED_MISSING', `missing ${field}`, { field });
  return value;
}

function allowanceSum(nodes, charge) {
  const amounts = nodes.filter(n => text(n, 'ChargeIndicator') === String(charge)).map(n => decimal(text(n, 'Amount'), 'AllowanceCharge/Amount', true));
  return amounts.length ? sum(amounts) : '0';
}

function readBreakdown(root) {
  const taxTotals = children(root, 'TaxTotal');
  const main = taxTotals.find(t => children(t, 'TaxSubtotal').length) || taxTotals[0];
  const eur = taxTotals.find(t => t !== main && child(t, 'TaxAmount')?.attrs.currencyID === 'EUR');
  const breakdown = children(main, 'TaxSubtotal').map(s => ({
    category: text(s, 'TaxCategory', 'ID'),
    rate: text(s, 'TaxCategory', 'ID') === 'O' ? null : decimal(text(s, 'TaxCategory', 'Percent'), 'TaxCategory/Percent') ?? '0',
    base: decimal(text(s, 'TaxableAmount'), 'TaxableAmount', true),
    vat: decimal(text(s, 'TaxAmount'), 'TaxSubtotal/TaxAmount', true),
    exemptionReasonCode: text(s, 'TaxCategory', 'TaxExemptionReasonCode'),
    exemptionReasonText: text(s, 'TaxCategory', 'TaxExemptionReason')
  }));
  return { vat: decimal(text(main, 'TaxAmount'), 'TaxAmount', true), vatEur: eur ? decimal(text(eur, 'TaxAmount'), 'TaxAmount EUR') : null, breakdown };
}

function readTotals(root, tax) {
  const lmt = required(child(root, 'LegalMonetaryTotal'), 'LegalMonetaryTotal');
  const get = (name, req = false) => decimal(text(lmt, name), name, req);
  return {
    lineNet: get('LineExtensionAmount', true),
    allowances: get('AllowanceTotalAmount') ?? '0.00',
    charges: get('ChargeTotalAmount') ?? '0.00',
    net: get('TaxExclusiveAmount', true),
    vat: tax.vat,
    vatEur: tax.vatEur,
    gross: get('TaxInclusiveAmount', true),
    prepaid: get('PrepaidAmount') ?? '0.00',
    rounding: get('PayableRoundingAmount') ?? '0.00',
    payable: get('PayableAmount', true),
    breakdown: tax.breakdown
  };
}

function readLine(el, creditNote, breakdown, warnings) {
  const qtyEl = child(el, creditNote ? 'CreditedQuantity' : 'InvoicedQuantity');
  const qty = decimal(text(qtyEl), 'Quantity', true);
  const price = decimal(text(el, 'Price', 'PriceAmount'), 'PriceAmount', true);
  const baseQty = decimal(text(el, 'Price', 'BaseQuantity'), 'BaseQuantity');
  const net = decimal(text(el, 'LineExtensionAmount'), 'LineExtensionAmount', true);
  const category = required(text(el, 'Item', 'ClassifiedTaxCategory', 'ID'), 'ClassifiedTaxCategory/ID');
  const rate = category === 'O' ? null : decimal(text(el, 'Item', 'ClassifiedTaxCategory', 'Percent'), 'Percent') ?? '0';
  const allowanceNodes = children(el, 'AllowanceCharge');
  const discount = sub(allowanceSum(allowanceNodes, false), allowanceSum(allowanceNodes, true));
  const gross = round(div(mul(qty, price), baseQty && !isZero(baseQty) ? baseQty : '1', 10), 2);
  const discountPct = isZero(discount) || isZero(gross) ? null : round(div(mul(discount, '100'), gross, 10), 4).replace(/\.?0+$/, '');
  const group = breakdown.find(b => b.category === category && (b.rate === rate || (b.rate && rate && cmp(b.rate, rate) === 0)));
  const line = {
    id: uuidv7(),
    kind: 'ITEM',
    name: text(el, 'Item', 'Name') || '',
    description: text(el, 'Item', 'Description') || '',
    qty,
    unit: { code: qtyEl?.attrs.unitCode || 'C62', label: '' },
    unitPrice: price,
    baseQty,
    priceType: 'NET',
    discountPct,
    vatRate: rate,
    vatCategory: category,
    exemptionReasonCode: group?.exemptionReasonCode || null,
    exemptionReasonText: group?.exemptionReasonText || null
  };
  const computed = sub(gross, isZero(discount) ? '0' : round(div(mul(gross, discountPct || '0'), '100', 10), 2));
  if (cmp(computed, net) !== 0) warnings.push({ code: 'LINE_AMOUNT_MISMATCH', line: text(el, 'ID'), stated: net, computed: round(computed, 2) });
  return line;
}

function readAttachments(root) {
  return children(root, 'AdditionalDocumentReference').map(ref => {
    const bin = child(ref, 'Attachment', 'EmbeddedDocumentBinaryObject');
    if (!bin) return null;
    return {
      id: text(ref, 'ID'),
      name: bin.attrs.filename || `${text(ref, 'ID') || 'attachment'}`,
      mime: bin.attrs.mimeCode || 'application/octet-stream',
      description: text(ref, 'DocumentDescription'),
      base64: bin.text.replace(/\s/g, '')
    };
  }).filter(Boolean);
}

function compareTotals(document, stated, warnings) {
  let computed;
  try {
    computed = computeTotals(document, { prepaid: stated.prepaid });
  } catch (error) {
    warnings.push({ code: 'TOTALS_NOT_COMPUTABLE', detail: error.code || error.message });
    return;
  }
  for (const key of ['lineNet', 'net', 'vat', 'gross', 'payable']) {
    if (cmp(computed[key], stated[key]) !== 0) warnings.push({ code: 'TOTALS_MISMATCH', field: key, stated: stated[key], computed: computed[key] });
  }
}

/**
 * @param {string} xml  UBL 2.1 Invoice or CreditNote
 * @param {{received?: boolean}} [options]  received: give the kinds of received documents
 * @returns {{document: object, attachments: object[], warnings: object[]}}
 *   warnings: {code: 'TOTALS_MISMATCH'|'LINE_AMOUNT_MISMATCH'|..., ...}; errors throw CoreError UBL_*
 */
export function parseUbl(xml, options = {}) {
  const root = parseXml(xml);
  if (root.name !== 'Invoice' && root.name !== 'CreditNote') throw new CoreError('UBL_ROOT_UNKNOWN', `unexpected root element ${root.qname}`);
  const creditNote = root.name === 'CreditNote';
  const typeCode = required(text(root, creditNote ? 'CreditNoteTypeCode' : 'InvoiceTypeCode'), 'type code');
  const warnings = [];
  const tax = readBreakdown(root);
  const totals = readTotals(root, tax);
  const kind = creditNote ? 'CREDIT_NOTE' : kindOfTypeCode(typeCode);
  const means = child(root, 'PaymentMeans');
  const account = child(means, 'PayeeFinancialAccount');
  const docAllowances = children(root, 'AllowanceCharge');
  const docDiscount = sub(allowanceSum(docAllowances, false), allowanceSum(docAllowances, true));
  const paymentId = text(means, 'PaymentID');
  const seller = readParty(child(root, 'AccountingSupplierParty', 'Party'), SK_SCHEME);
  const buyer = readParty(child(root, 'AccountingCustomerParty', 'Party'), SK_SCHEME);

  const document = {
    kind: options.received ? (RECEIVED[kind] || 'RECEIVED_INVOICE') : kind,
    ublTypeCode: typeCode,
    number: required(text(root, 'ID'), 'ID'),
    issueDate: required(text(root, 'IssueDate'), 'IssueDate'),
    dueDate: text(root, 'DueDate') || text(means, 'PaymentDueDate'),
    taxDate: text(root, 'TaxPointDate') || text(root, 'Delivery', 'ActualDeliveryDate'),
    deliveryDate: text(root, 'Delivery', 'ActualDeliveryDate'),
    periodFrom: text(root, 'InvoicePeriod', 'StartDate'),
    periodTo: text(root, 'InvoicePeriod', 'EndDate'),
    currency: required(text(root, 'DocumentCurrencyCode'), 'DocumentCurrencyCode'),
    buyerReference: text(root, 'BuyerReference'),
    orderReference: text(root, 'OrderReference', 'ID'),
    contractReference: text(root, 'ContractDocumentReference', 'ID'),
    seller,
    buyer,
    lines: children(root, creditNote ? 'CreditNoteLine' : 'InvoiceLine').map(el => readLine(el, creditNote, tax.breakdown, warnings)),
    docDiscount: isZero(docDiscount) ? null : { pct: null, amount: round(docDiscount, 2), reason: text(docAllowances[0], 'AllowanceChargeReason') },
    rounding: isZero(totals.rounding) ? null : totals.rounding,
    totals,
    vs: paymentId && /^[0-9]{1,10}$/.test(paymentId) ? paymentId : null,
    paymentReference: paymentId,
    paymentMethod: methodOfPaymentCode(text(means, 'PaymentMeansCode')),
    paymentAccount: account ? { iban: text(account, 'ID'), name: text(account, 'Name'), bic: text(account, 'FinancialInstitutionBranch', 'ID') } : null,
    preceding: children(root, 'BillingReference').map(r => ({ number: text(r, 'InvoiceDocumentReference', 'ID'), issueDate: text(r, 'InvoiceDocumentReference', 'IssueDate') })).filter(p => p.number),
    textIntro: children(root, 'Note').map(n => text(n)).filter(Boolean).join('\n') || null
  };
  if (!document.lines.length) throw new CoreError('UBL_REQUIRED_MISSING', 'no invoice lines', { field: 'InvoiceLine' });
  compareTotals(document, totals, warnings);
  return { document, attachments: readAttachments(root), warnings };
}
