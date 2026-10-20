// Document: one entity for every kind (invoice, proforma, credit note,
// quote, received invoice, receipt...). Seller and buyer are snapshots taken
// at issue and never change afterwards. Totals are computed by
// computeTotals() and stored for the archive.
import {
  entity, object, enumOf, nullableEnumOf, ID, NULLABLE_ID, SHORT_TEXT, TEXT, NULLABLE_TEXT, DECIMAL,
  NULLABLE_DECIMAL, DATE, NULLABLE_DATE, DATE_TIME, NULLABLE_DATE_TIME, CURRENCY, PARTY_SNAPSHOT, STRING_LIST
} from '../common.js';
import {
  DOCUMENT_KINDS, DOCUMENT_STATUSES, PRICE_TYPES, VAT_CATEGORIES, PAYMENT_METHODS, PAYMENT_SOURCES,
  LINK_KINDS, SEND_CHANNELS, PEPPOL_DIRECTIONS, PEPPOL_STATUSES, PRINT_LANGUAGES, DOCUMENT_TEMPLATES
} from '../enums.js';

// A line. A line with kind TEXT is a heading or separator without amounts;
// SUBTOTAL prints the running sum of the lines above it.
export const LINE = object({
  id: ID,
  kind: { enum: ['ITEM', 'TEXT', 'SUBTOTAL'] },
  itemId: NULLABLE_ID,
  name: SHORT_TEXT,
  description: TEXT,
  qty: DECIMAL,
  unit: { type: 'object', properties: { code: { type: 'string', maxLength: 3 }, label: SHORT_TEXT } },
  unitPrice: DECIMAL,
  baseQty: NULLABLE_DECIMAL,
  priceType: enumOf(PRICE_TYPES),
  discountPct: NULLABLE_DECIMAL,
  vatRate: NULLABLE_DECIMAL,
  vatCategory: enumOf(VAT_CATEGORIES),
  exemptionReasonCode: { type: ['string', 'null'], maxLength: 40 },
  exemptionReasonText: NULLABLE_TEXT,
  accountingCategory: { type: ['string', 'null'], maxLength: 60 },
  warehouseId: NULLABLE_ID
}, ['id', 'name', 'qty', 'unitPrice', 'vatCategory']);

// Discount (or charge) on the whole document, split by VAT category and rate
// in UBL (BT-107 / BT-108).
export const DOC_DISCOUNT = object({
  pct: NULLABLE_DECIMAL,
  amount: NULLABLE_DECIMAL,
  reason: NULLABLE_TEXT
});

export const LINK = object({
  kind: enumOf(LINK_KINDS),
  docId: ID,
  amount: NULLABLE_DECIMAL
}, ['kind', 'docId']);

export const PAYMENT = object({
  id: ID,
  date: DATE,
  amount: DECIMAL,
  currency: { type: 'string', pattern: '^[A-Z]{3}$' },
  method: enumOf(PAYMENT_METHODS),
  source: enumOf(PAYMENT_SOURCES),
  bankTxId: NULLABLE_ID,
  cashBookId: NULLABLE_ID,
  // eKasa receipt issued for a cash or card payment (12-risks § 12.3).
  ekasaReceiptId: { type: ['string', 'null'], maxLength: 100 },
  ekasaOkp: { type: ['string', 'null'], maxLength: 100 },
  note: NULLABLE_TEXT
}, ['id', 'date', 'amount', 'method', 'source']);

export const PEPPOL_STATE = object({
  direction: enumOf(PEPPOL_DIRECTIONS),
  status: enumOf(PEPPOL_STATUSES),
  providerId: { type: ['string', 'null'], maxLength: 60 },
  providerMessageId: { type: ['string', 'null'], maxLength: 200 },
  sentAt: NULLABLE_DATE_TIME,
  deliveredAt: NULLABLE_DATE_TIME,
  receivedAt: NULLABLE_DATE_TIME,
  acknowledgedAt: NULLABLE_DATE_TIME,
  mls: { type: ['object', 'null'] },
  // params: what an error text needs, e.g. {bytes, limit} of a message over the size limit.
  errors: { type: 'array', items: object({ code: SHORT_TEXT, message: TEXT, field: { type: ['string', 'null'] }, params: { type: 'object' } }) },
  xmlFileId: NULLABLE_ID,
  revision: { type: 'integer', minimum: 0 },
  // Send queue: attempts of the current revision and when to retry after a
  // network or server failure; delivery checks made and when to ask again.
  attempts: { type: 'integer', minimum: 0 },
  nextAttemptAt: NULLABLE_DATE_TIME,
  statusChecks: { type: 'integer', minimum: 0 },
  nextCheckAt: NULLABLE_DATE_TIME,
  // Attachments of the document not embedded because Peppol does not accept their file type.
  skippedAttachments: STRING_LIST
}, ['direction', 'status']);

export const SEND_LOG_ENTRY = object({
  at: DATE_TIME,
  channel: enumOf(SEND_CHANNELS),
  to: { type: ['string', 'null'], maxLength: 500 },
  result: { type: 'string', maxLength: 40 },
  detail: NULLABLE_TEXT
}, ['at', 'channel', 'result']);

// Totals as computed by computeTotals(); BT numbers from EN 16931.
export const TOTALS = object({
  lineNet: DECIMAL, // BT-106
  allowances: DECIMAL, // BT-107
  charges: DECIMAL, // BT-108
  net: DECIMAL, // BT-109
  vat: DECIMAL, // BT-110
  vatEur: NULLABLE_DECIMAL, // BT-111 when the document is not in EUR
  gross: DECIMAL, // BT-112
  prepaid: DECIMAL, // BT-113
  rounding: DECIMAL, // BT-114
  payable: DECIMAL, // BT-115
  breakdown: {
    type: 'array',
    items: object({ category: enumOf(VAT_CATEGORIES), rate: NULLABLE_DECIMAL, base: DECIMAL, vat: DECIMAL }, ['category', 'base', 'vat'])
  }
}, ['net', 'vat', 'gross', 'payable']);

export const documentSchema = entity('Document', {
  kind: enumOf(DOCUMENT_KINDS),
  seriesId: NULLABLE_ID,
  number: { type: ['string', 'null'], maxLength: 60 },
  vs: { type: ['string', 'null'], pattern: '^[0-9]{0,10}$' },
  ks: { type: ['string', 'null'], pattern: '^[0-9]{0,4}$' },
  ss: { type: ['string', 'null'], pattern: '^[0-9]{0,10}$' },
  status: enumOf(DOCUMENT_STATUSES),
  issueDate: NULLABLE_DATE,
  taxDate: NULLABLE_DATE,
  dueDate: NULLABLE_DATE,
  deliveryDate: NULLABLE_DATE,
  receivedDate: NULLABLE_DATE,
  validUntil: NULLABLE_DATE,
  periodFrom: NULLABLE_DATE,
  periodTo: NULLABLE_DATE,
  vatDeductionPeriod: { type: ['string', 'null'], pattern: '^[0-9]{4}-(0[1-9]|1[0-2]|Q[1-4])$' },
  currency: CURRENCY,
  fxRate: NULLABLE_DECIMAL,
  fxRateDate: NULLABLE_DATE,
  fxSource: { enum: ['ECB', 'MANUAL', null] },
  seller: PARTY_SNAPSHOT,
  buyer: PARTY_SNAPSHOT,
  contactId: NULLABLE_ID,
  lines: { type: 'array', items: LINE },
  docDiscount: { anyOf: [DOC_DISCOUNT, { type: 'null' }] },
  rounding: NULLABLE_DECIMAL,
  totals: { anyOf: [TOTALS, { type: 'null' }] },
  paymentMethod: enumOf(PAYMENT_METHODS),
  bankAccountId: NULLABLE_ID,
  paymentLink: { type: ['string', 'null'], maxLength: 1000 },
  buyerReference: { type: ['string', 'null'], maxLength: 200 }, // BT-10
  orderReference: { type: ['string', 'null'], maxLength: 200 }, // BT-13
  contractReference: { type: ['string', 'null'], maxLength: 200 }, // BT-12
  correctionReason: NULLABLE_TEXT,
  classified: { type: 'boolean' }, // "Utajovaná dodávka": Peppol not allowed
  textIntro: NULLABLE_TEXT,
  textOutro: NULLABLE_TEXT,
  noteInternal: NULLABLE_TEXT,
  language: enumOf(PRINT_LANGUAGES),
  secondLanguage: nullableEnumOf(PRINT_LANGUAGES),
  template: enumOf(DOCUMENT_TEMPLATES),
  links: { type: 'array', items: LINK },
  payments: { type: 'array', items: PAYMENT },
  peppol: { anyOf: [PEPPOL_STATE, { type: 'null' }] },
  pdfFileId: NULLABLE_ID,
  attachments: { type: 'array', items: object({ id: ID, name: SHORT_TEXT, mime: SHORT_TEXT, size: { type: 'integer', minimum: 0 } }, ['id', 'name']) },
  sendLog: { type: 'array', items: SEND_LOG_ENTRY },
  exportedAt: NULLABLE_DATE_TIME,
  lockedAt: NULLABLE_DATE_TIME,
  recurringTemplateId: NULLABLE_ID,
  recurringPeriodStart: NULLABLE_DATE,
  tags: STRING_LIST,
  projectRef: { type: ['string', 'null'], maxLength: 200 }
}, ['kind', 'status', 'currency', 'lines']);
