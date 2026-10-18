// Writes the UBL 2.1 Invoice or CreditNote of Peppol BIS Billing 3.0 from
// the model of model.js. Element order follows the UBL 2.1 schemas, which
// differ slightly between Invoice and CreditNote (TaxPointDate position,
// DueDate only on Invoice, line element names).
import { leaf, node, serialize } from './xml.js';
import { CUSTOMIZATION_ID, PROFILE_ID, NS, paymentMeansCode, unitCode } from './codes.js';
import { partyNode } from './parties.js';
import { isZero, cmp } from '../money/index.js';

const amount = (name, value, currency) => leaf(name, value, { currencyID: currency });
const nonZero = (value) => (value !== null && value !== undefined && !isZero(value) ? value : null);

function taxCategory(name, category, rate, extra = []) {
  return node(name, [
    leaf('cbc:ID', category),
    category === 'O' ? null : leaf('cbc:Percent', rate ?? '0'),
    ...extra,
    node('cac:TaxScheme', [leaf('cbc:ID', 'VAT')])
  ]);
}

function headerDates(m) {
  const d = m.document;
  const typeCode = leaf(m.creditNote ? 'cbc:CreditNoteTypeCode' : 'cbc:InvoiceTypeCode', m.typeCode);
  const note = leaf('cbc:Note', m.note);
  const taxPoint = leaf('cbc:TaxPointDate', d.taxDate);
  if (m.creditNote) return [leaf('cbc:IssueDate', d.issueDate), taxPoint, typeCode, note];
  return [leaf('cbc:IssueDate', d.issueDate), leaf('cbc:DueDate', d.dueDate), typeCode, note, taxPoint];
}

function references(m) {
  const d = m.document;
  // PEPPOL-EN16931-R003: a buyer reference or an order reference is required; the invoice number stands in.
  const buyerReference = d.buyerReference || (d.orderReference ? null : d.number);
  return [
    leaf('cbc:BuyerReference', buyerReference),
    node('cac:InvoicePeriod', [leaf('cbc:StartDate', d.periodFrom), leaf('cbc:EndDate', d.periodTo)]),
    node('cac:OrderReference', [leaf('cbc:ID', d.orderReference)]),
    m.preceding.map(p => node('cac:BillingReference', [
      node('cac:InvoiceDocumentReference', [leaf('cbc:ID', p.number), leaf('cbc:IssueDate', p.issueDate)])
    ])),
    node('cac:ContractDocumentReference', [leaf('cbc:ID', d.contractReference)]),
    m.pdf ? node('cac:AdditionalDocumentReference', [
      leaf('cbc:ID', d.number),
      node('cac:Attachment', [leaf('cbc:EmbeddedDocumentBinaryObject', m.pdf.base64, {
        mimeCode: 'application/pdf', filename: m.pdf.name || `${d.number}.pdf`
      })])
    ]) : null
  ];
}

// BR-IC-12: an intra-community supply states the country it was delivered to (BT-80).
function delivery(m) {
  const d = m.document;
  const place = m.categories.has('K') ? (d.deliveryAddress || m.buyer.address || {}) : null;
  return node('cac:Delivery', [
    leaf('cbc:ActualDeliveryDate', d.deliveryDate || d.taxDate),
    place ? node('cac:DeliveryLocation', [node('cac:Address', [
      leaf('cbc:StreetName', place.street),
      leaf('cbc:CityName', place.city),
      leaf('cbc:PostalZone', place.zip),
      node('cac:Country', [leaf('cbc:IdentificationCode', (place.country || 'SK').toUpperCase())])
    ])]) : null
  ]);
}

function payment(m) {
  const d = m.document;
  if (m.creditNote) {
    // A refund: the account of the buyer is not known, so the means stay undefined (UNCL4461 code 1).
    return node('cac:PaymentMeans', [leaf('cbc:PaymentMeansCode', '1'), leaf('cbc:PaymentDueDate', d.dueDate), leaf('cbc:PaymentID', d.vs)]);
  }
  const transfer = paymentMeansCode(d.paymentMethod, m.currency);
  const isTransfer = transfer === '58' || transfer === '30';
  const account = isTransfer ? m.bankAccount : null;
  // BR-61: a credit transfer names the payee account; without one the means stay undefined.
  const code = isTransfer && !account?.iban ? '1' : transfer;
  return node('cac:PaymentMeans', [
    leaf('cbc:PaymentMeansCode', code),
    leaf('cbc:PaymentID', d.vs),
    account ? node('cac:PayeeFinancialAccount', [
      leaf('cbc:ID', String(account.iban).replace(/\s/g, '')),
      leaf('cbc:Name', account.name),
      node('cac:FinancialInstitutionBranch', [leaf('cbc:ID', account.bic)])
    ]) : null
  ]);
}

function documentAllowances(m) {
  const reason = m.document.docDiscount?.reason;
  return m.totals.docAllowances.map(a => node('cac:AllowanceCharge', [
    leaf('cbc:ChargeIndicator', a.charge ? 'true' : 'false'),
    leaf('cbc:AllowanceChargeReasonCode', a.charge ? 'ZZZ' : '95'),
    leaf('cbc:AllowanceChargeReason', reason),
    amount('cbc:Amount', a.amount, m.currency),
    taxCategory('cac:TaxCategory', a.category, a.rate)
  ]));
}

function taxTotals(m) {
  const t = m.totals;
  const main = node('cac:TaxTotal', [
    amount('cbc:TaxAmount', t.vat, m.currency),
    t.breakdown.map(b => node('cac:TaxSubtotal', [
      amount('cbc:TaxableAmount', b.base, m.currency),
      amount('cbc:TaxAmount', b.vat, m.currency),
      taxCategory('cac:TaxCategory', b.category, b.rate, [
        leaf('cbc:TaxExemptionReasonCode', b.exemptionReasonCode),
        leaf('cbc:TaxExemptionReason', b.exemptionReasonText)
      ])
    ]))
  ]);
  // BT-111: VAT in the accounting currency EUR, without subtotals (PEPPOL-EN16931-R053).
  const eur = m.currency !== 'EUR' && t.vatEur !== null ? node('cac:TaxTotal', [amount('cbc:TaxAmount', t.vatEur, 'EUR')]) : null;
  return [main, eur];
}

function monetaryTotal(m) {
  const t = m.totals;
  const c = m.currency;
  return node('cac:LegalMonetaryTotal', [
    amount('cbc:LineExtensionAmount', t.lineNet, c),
    amount('cbc:TaxExclusiveAmount', t.net, c),
    amount('cbc:TaxInclusiveAmount', t.gross, c),
    amount('cbc:AllowanceTotalAmount', nonZero(t.allowances), c),
    amount('cbc:ChargeTotalAmount', nonZero(t.charges), c),
    amount('cbc:PrepaidAmount', nonZero(t.prepaid), c),
    amount('cbc:PayableRoundingAmount', nonZero(t.rounding), c),
    amount('cbc:PayableAmount', t.payable, c)
  ]);
}

function lineNode(m, line) {
  const { source, amounts } = line;
  const unit = unitCode(source);
  const baseQty = source.baseQty && cmp(source.baseQty, '1') !== 0 ? source.baseQty : null;
  return node(m.creditNote ? 'cac:CreditNoteLine' : 'cac:InvoiceLine', [
    leaf('cbc:ID', String(line.index)),
    leaf(m.creditNote ? 'cbc:CreditedQuantity' : 'cbc:InvoicedQuantity', line.qty, { unitCode: unit }),
    amount('cbc:LineExtensionAmount', amounts.net, m.currency),
    nonZero(amounts.allowance) ? node('cac:AllowanceCharge', [
      leaf('cbc:ChargeIndicator', 'false'),
      leaf('cbc:AllowanceChargeReasonCode', '95'),
      amount('cbc:Amount', amounts.allowance, m.currency)
    ]) : null,
    node('cac:Item', [
      leaf('cbc:Description', source.description),
      leaf('cbc:Name', source.name),
      taxCategory('cac:ClassifiedTaxCategory', amounts.category, amounts.rate)
    ]),
    node('cac:Price', [
      amount('cbc:PriceAmount', line.price, m.currency),
      leaf('cbc:BaseQuantity', baseQty, { unitCode: unit })
    ])
  ]);
}

/** UBL XML of the model. */
export function writeUbl(m) {
  const d = m.document;
  const root = node(m.root, [
    leaf('cbc:CustomizationID', CUSTOMIZATION_ID),
    leaf('cbc:ProfileID', PROFILE_ID),
    leaf('cbc:ID', d.number),
    ...headerDates(m),
    leaf('cbc:DocumentCurrencyCode', m.currency),
    m.currency !== 'EUR' ? leaf('cbc:TaxCurrencyCode', 'EUR') : null,
    ...references(m),
    node('cac:AccountingSupplierParty', [partyNode(m.seller, { endpoint: m.sellerEndpoint, vatId: m.vatIds, seller: true })]),
    node('cac:AccountingCustomerParty', [partyNode(m.buyer, { endpoint: m.buyerEndpoint, vatId: m.vatIds, seller: false })]),
    delivery(m),
    payment(m),
    ...documentAllowances(m),
    ...taxTotals(m),
    monetaryTotal(m),
    m.lines.map(line => lineNode(m, line))
  ], { xmlns: NS[m.root], 'xmlns:cac': NS.cac, 'xmlns:cbc': NS.cbc });
  return serialize(root);
}
