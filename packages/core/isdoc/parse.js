// ISDOC reader: an invoice of a Czech supplier (or our own, migrated from
// another program) becomes a document of the data model. Amounts are
// taken in the document currency (the *Curr elements when the invoice is
// in a foreign currency), lines keep their net unit price, and the totals
// are recomputed and compared with the stated payable amount: a
// difference is reported as a warning, never silently corrected.
import { parseXml, child, children, textAt, at } from '../imports/xml.js';
import { CoreError } from '../errors.js';
import { div, mul, cmp, sub, abs, round, isZero } from '../money/index.js';
import { computeTotals } from '../vat/index.js';
import { KINDS_BY_TYPE, METHODS_BY_MEANS } from './codes.js';

function party(node) {
  const p = child(node, 'Party');
  if (!p) return null;
  const street = [textAt(p, 'PostalAddress/StreetName'), textAt(p, 'PostalAddress/BuildingNumber')].filter(Boolean).join(' ');
  const vatId = textAt(p, 'PartyTaxScheme/CompanyID');
  const country = textAt(p, 'PostalAddress/Country/IdentificationCode');
  const prefixed = vatId && /^[A-Z]{2}/.test(vatId);
  return {
    name: textAt(p, 'PartyName/Name') || '',
    ico: textAt(p, 'PartyIdentification/ID'),
    // A Czech DIČ is the VAT number itself; a Slovak DIČ is not in ISDOC.
    dic: prefixed && vatId.startsWith('CZ') ? vatId : null,
    icDph: prefixed ? vatId : null,
    address: { street, city: textAt(p, 'PostalAddress/CityName') || '', zip: textAt(p, 'PostalAddress/PostalZone') || '', country: country || '' },
    email: textAt(p, 'Contact/ElectronicMail'),
    phone: textAt(p, 'Contact/Telephone'),
    vatPayer: Boolean(vatId)
  };
}

function category(line, docVatApplicable) {
  const tax = child(line, 'ClassifiedTaxCategory');
  const percent = textAt(tax, 'Percent') || '0';
  if (textAt(tax, 'LocalReverseCharge') || textAt(tax, 'LocalReverseChargeFlag') === 'true') return { vatCategory: 'AE', vatRate: null };
  if (!docVatApplicable) return { vatCategory: 'O', vatRate: null };
  if (textAt(tax, 'VATApplicable') === 'false') return { vatCategory: 'E', vatRate: null };
  if (isZero(percent)) return { vatCategory: 'Z', vatRate: null };
  return { vatCategory: 'S', vatRate: percent.replace(/\.0+$/, '') };
}

/**
 * @param {string} xml
 * @param {{direction?: 'IN'|'OUT'}} [options] IN (default): an invoice we received
 * @returns {{document: object, warnings: string[], references: {corrects: string|null}}}
 */
export function parseIsdoc(xml, options = {}) {
  const root = parseXml(xml);
  if (root.name !== 'Invoice') throw new CoreError('ISDOC_INVALID', `root element is ${root.name}, not Invoice`);
  const warnings = [];
  const direction = options.direction === 'OUT' ? 'OUT' : 'IN';
  const type = textAt(root, 'DocumentType') || '1';
  const kind = KINDS_BY_TYPE[direction][type];
  if (!kind) throw new CoreError('ISDOC_INVALID', `unknown DocumentType ${type}`);
  const local = textAt(root, 'LocalCurrencyCode') || 'EUR';
  const foreignCode = textAt(root, 'ForeignCurrencyCode');
  const foreign = Boolean(foreignCode && foreignCode !== local);
  const currency = foreign ? foreignCode : local;
  const pick = (node, name) => (foreign ? textAt(node, `${name}Curr`) : null) || textAt(node, name);
  let fxRate = null;
  if (foreign && local === 'EUR') {
    const curr = textAt(root, 'CurrRate') || '1';
    const ref = textAt(root, 'RefCurrRate') || '1';
    fxRate = isZero(curr) ? null : div(ref, curr, 6);
  } else if (foreign) {
    warnings.push('FX_RATE_NOT_IN_EUR');
  }
  const docVatApplicable = textAt(root, 'VATApplicable') !== 'false';

  const lines = children(child(root, 'InvoiceLines'), 'InvoiceLine').map((line, i) => {
    const qtyNode = child(line, 'InvoicedQuantity');
    const qty = (qtyNode && qtyNode.text.trim()) || '1';
    const net = pick(line, 'LineExtensionAmount') || '0';
    const before = foreign ? null : textAt(line, 'LineExtensionAmountBeforeDiscount');
    let unitPrice = foreign || !textAt(line, 'UnitPrice') ? (isZero(qty) ? net : round(div(net, qty, 10), 4)) : textAt(line, 'UnitPrice');
    let discountPct = null;
    if (before && !isZero(before) && cmp(before, net) !== 0) {
      discountPct = round(mul(sub('1', div(net, before, 10)), '100'), 4).replace(/\.?0+$/, '');
    } else if (!isZero(qty) && cmp(abs(sub(mul(unitPrice, qty), net)), '0.01') > 0) {
      unitPrice = round(div(net, qty, 10), 4);
    }
    return {
      id: `isdoc-${i + 1}`, kind: 'ITEM', itemId: null,
      name: textAt(line, 'Item/Description') || textAt(line, 'Note') || '',
      description: textAt(line, 'Item/Description') ? textAt(line, 'Note') || '' : '',
      qty, unit: qtyNode && qtyNode.attrs.unitCode ? { code: qtyNode.attrs.unitCode.slice(0, 3), label: qtyNode.attrs.unitCode } : null,
      unitPrice, priceType: 'NET', discountPct, ...category(line, docVatApplicable)
    };
  });

  const payment = at(root, 'PaymentMeans/Payment');
  const details = child(payment, 'Details');
  const document = {
    kind,
    number: textAt(root, 'ID'),
    status: direction === 'IN' ? 'TO_PROCESS' : 'ISSUED',
    issueDate: textAt(root, 'IssueDate'),
    taxDate: textAt(root, 'TaxPointDate') || textAt(root, 'IssueDate'),
    dueDate: textAt(details, 'PaymentDueDate'),
    currency,
    fxRate,
    fxSource: fxRate ? 'MANUAL' : null,
    seller: party(child(root, 'AccountingSupplierParty')),
    buyer: party(child(root, 'AccountingCustomerParty')),
    lines,
    vs: (textAt(details, 'VariableSymbol') || '').replace(/\D/g, '').slice(0, 10) || null,
    ks: (textAt(details, 'ConstantSymbol') || '').replace(/\D/g, '').slice(0, 4) || null,
    ss: (textAt(details, 'SpecificSymbol') || '').replace(/\D/g, '').slice(0, 10) || null,
    paymentMethod: METHODS_BY_MEANS[textAt(payment, 'PaymentMeansCode')] || 'TRANSFER',
    textIntro: textAt(root, 'Note'),
    payments: [],
    links: [],
    externalId: textAt(root, 'UUID')
  };
  if (!document.number) warnings.push('NUMBER_MISSING');
  if (!lines.length) warnings.push('NO_LINES');
  const iban = textAt(details, 'IBAN');
  if (iban) document.supplierIban = iban.replace(/\s/g, '');

  const stated = pick(child(root, 'LegalMonetaryTotal'), 'PayableAmount');
  try {
    const totals = computeTotals({ ...document, rounding: pick(child(root, 'LegalMonetaryTotal'), 'PayableRoundingAmount') || null }, {
      prepaid: pick(child(root, 'LegalMonetaryTotal'), 'PaidDepositsAmount') || '0'
    });
    if (stated && cmp(abs(sub(totals.payable, stated)), '0.01') > 0) warnings.push('TOTALS_MISMATCH');
  } catch (e) {
    warnings.push(`TOTALS_UNREADABLE:${e.code || e.message}`);
  }
  const corrects = textAt(root, 'OriginalDocumentReferences/OriginalDocumentReference/ID');
  return { document, warnings, references: { corrects } };
}
