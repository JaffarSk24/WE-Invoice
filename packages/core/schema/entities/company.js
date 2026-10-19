// Company (firma): the user's own business. A workspace may hold any number
// of them; each has its own encrypted data file in Drive.
import {
  entity, object, enumOf, ID, NULLABLE_ID, SHORT_TEXT, NULLABLE_TEXT, TEXT, CURRENCY, NULLABLE_DATE,
  NULLABLE_DATE_TIME, ADDRESS, BANK_ACCOUNT, STRING_LIST
} from '../common.js';
import {
  LEGAL_FORMS, TAXPAYER_TYPES, VAT_MODES, VAT_PERIODS, ACCOUNTING_MODES, DOCUMENT_KINDS,
  SERIES_RESETS, PAYMENT_METHODS, PRINT_LANGUAGES, DOCUMENT_TEMPLATES
} from '../enums.js';

// Numbering series (03-features.md § 3.5). The mask uses {YYYY}, {YY}, {MM},
// {N}, {N:4}; counters are kept per reset period.
export const SERIES = object({
  id: ID,
  name: SHORT_TEXT,
  kind: enumOf(DOCUMENT_KINDS),
  mask: { type: 'string', minLength: 1, maxLength: 60 },
  vsMask: { type: ['string', 'null'], maxLength: 60 },
  reset: enumOf(SERIES_RESETS),
  isDefault: { type: 'boolean' },
  // Next counter value per period key ("2026", "2026-10" or "all").
  counters: { type: 'object', additionalProperties: { type: 'integer', minimum: 1 } }
}, ['id', 'kind', 'mask', 'reset']);

export const COMPANY_DEFAULTS = object({
  dueDays: { type: 'integer', minimum: 0, maximum: 3650 },
  currency: CURRENCY,
  language: enumOf(PRINT_LANGUAGES),
  secondLanguage: { enum: [...PRINT_LANGUAGES, null] },
  template: enumOf(DOCUMENT_TEMPLATES),
  brandColor: { type: ['string', 'null'], pattern: '^#[0-9a-fA-F]{6}$' },
  texts: object({ intro: NULLABLE_TEXT, outro: NULLABLE_TEXT, footer: NULLABLE_TEXT }),
  paymentMethod: enumOf(PAYMENT_METHODS),
  roundingCash: { type: 'boolean' },
  pdfFileMask: { type: 'string', maxLength: 120 },
  showMadeWith: { type: 'boolean' },
  attachPdfToEInvoice: { type: 'boolean' }
});

export const COMPANY_PEPPOL = object({
  providerId: { type: ['string', 'null'], maxLength: 60 },
  baseUrl: { type: ['string', 'null'], maxLength: 500 },
  participantId: { type: ['string', 'null'], pattern: '^0245:[0-9]{10}$' },
  enabled: { type: 'boolean' },
  sandbox: { type: 'boolean' },
  lastCheckAt: NULLABLE_DATE_TIME,
  capabilities: { type: 'object' },
  // Wizard and service settings of WP-PEPPOL: receive automatically, send a
  // copy by e-mail, the provider chosen in VPDS, and the last SMP lookup
  // (null until checked).
  autoReceive: { type: 'boolean' },
  emailCopy: { type: 'boolean' },
  vpdsDone: { type: 'boolean' },
  registered: { type: ['boolean', 'null'] }
});

export const companySchema = entity('Company', {
  name: SHORT_TEXT,
  legalForm: enumOf(LEGAL_FORMS),
  taxpayerType: enumOf(TAXPAYER_TYPES),
  ico: { type: ['string', 'null'], pattern: '^[0-9]{6,8}$' },
  dic: { type: ['string', 'null'], pattern: '^[0-9]{10}$' },
  icDph: { type: ['string', 'null'], pattern: '^[A-Z]{2}[0-9A-Z]{2,13}$' },
  vatMode: enumOf(VAT_MODES),
  vatPeriod: enumOf(VAT_PERIODS),
  cashBasis: { type: 'boolean' },
  oss: { type: 'boolean' },
  usesEkasa: { type: 'boolean' },
  registerEntry: NULLABLE_TEXT,
  address: ADDRESS,
  bankAccounts: { type: 'array', items: BANK_ACCOUNT },
  email: { type: ['string', 'null'], maxLength: 320 },
  phone: { type: ['string', 'null'], maxLength: 50 },
  web: { type: ['string', 'null'], maxLength: 300 },
  logoFileId: NULLABLE_ID,
  signatureFileId: NULLABLE_ID,
  stampFileId: NULLABLE_ID,
  accountingMode: enumOf(ACCOUNTING_MODES),
  businessStartDate: NULLABLE_DATE,
  peppol: COMPANY_PEPPOL,
  // Provider API keys and SMTP passwords, stored only inside the encrypted
  // data file (02-architecture.md § 2.5).
  secrets: { type: 'object' },
  defaults: COMPANY_DEFAULTS,
  series: { type: 'array', items: SERIES },
  closedPeriods: STRING_LIST,
  note: TEXT,
  onboardedAt: NULLABLE_DATE_TIME
}, ['name', 'legalForm', 'taxpayerType', 'vatMode', 'accountingMode']);
