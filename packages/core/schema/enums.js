// Closed value lists shared by the schemas and the code. Every enum the data
// model uses lives here once, frozen, so a schema and a switch statement can
// never disagree about which values exist.

const list = (...values) => Object.freeze(values);

export const LEGAL_FORMS = list('FO_ZIVNOST', 'SRO', 'AS', 'NGO', 'OTHER');
export const TAXPAYER_TYPES = list('FO', 'PO');

// PAYER: registered under § 4, 4b, 4c; REGISTERED_7: § 7 / 7a; NONPAYER.
export const VAT_MODES = list('PAYER', 'REGISTERED_7', 'NONPAYER');
export const VAT_PERIODS = list('MONTH', 'QUARTER');

export const ACCOUNTING_MODES = list('NONE', 'TAX_RECORDS_FLAT', 'SIMPLE', 'EXTERNAL');

export const CONTACT_KINDS = list('COMPANY', 'PERSON');

export const DOCUMENT_KINDS = list(
  'INVOICE', 'PROFORMA', 'ADVANCE_TAX_DOC', 'CREDIT_NOTE', 'DEBIT_NOTE', 'QUOTE',
  'ORDER_IN', 'ORDER_OUT', 'DELIVERY_NOTE', 'CASH_IN', 'CASH_OUT', 'INTERNAL',
  'RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT', 'REMINDER', 'SELF_BILLING',
  'SALES_RECEIPT'
);

// Statuses of every document kind in one list; which ones a kind may take is
// decided by packages/core/documents (WP-CORE).
export const DOCUMENT_STATUSES = list(
  'DRAFT', 'ISSUED', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERPAID', 'OVERDUE', 'CANCELLED',
  'ACCEPTED', 'REJECTED', 'EXPIRED', 'TO_PROCESS', 'PROCESSED', 'BOOKED'
);

// EN 16931 / UNCL5305 categories used in Slovakia. L and M are not used.
export const VAT_CATEGORIES = list('S', 'Z', 'E', 'AE', 'K', 'G', 'O');

export const PRICE_TYPES = list('NET', 'GROSS');

export const PAYMENT_METHODS = list('TRANSFER', 'CASH', 'CARD', 'COD', 'OFFSET', 'ONLINE', 'QR_ON_SITE');
export const PAYMENT_SOURCES = list('MANUAL', 'BANK_IMPORT', 'CASH');

export const LINK_KINDS = list('FROM_QUOTE', 'FROM_ORDER', 'FROM_PROFORMA', 'CORRECTS', 'ADVANCE_DEDUCTION', 'DELIVERY_FOR');

export const SEND_CHANNELS = list('EMAIL', 'PEPPOL', 'LINK', 'PRINT');

export const PEPPOL_DIRECTIONS = list('OUT', 'IN');
// Outgoing flow (04-peppol.md § 4.6) plus RECEIVED for incoming documents.
export const PEPPOL_STATUSES = list(
  'DRAFT', 'VALIDATING', 'READY', 'SENDING', 'ACCEPTED', 'DELIVERED', 'INVALID', 'REJECTED', 'FAILED', 'RECEIVED'
);

export const PEPPOL_REQUIREMENTS = list('MANDATORY', 'OPTIONAL', 'NOT_ALLOWED', 'NOT_APPLICABLE');

export const SERIES_RESETS = list('YEARLY', 'MONTHLY', 'NEVER');

export const RECURRING_FREQUENCIES = list('WEEK', 'MONTH', 'QUARTER', 'HALF_YEAR', 'YEAR', 'MONTHS');

export const STOCK_MOVE_KINDS = list('RECEIPT', 'ISSUE', 'TRANSFER', 'ADJUSTMENT');

export const LEDGER_DIRECTIONS = list('INCOME', 'EXPENSE', 'TRANSFER');
export const LEDGER_MEDIA = list('CASH', 'BANK');

export const ASSET_KINDS = list('TANGIBLE', 'INTANGIBLE');
export const DEPRECIATION_METHODS = list('STRAIGHT', 'ACCELERATED');

export const AUDIT_ACTIONS = list('CREATE', 'UPDATE', 'DELETE', 'ISSUE', 'SEND', 'LOCK', 'UNLOCK', 'EXPORT', 'PERIOD_CLOSE', 'PERIOD_OPEN');

export const UI_LANGUAGES = list('sk', 'cs', 'en', 'de', 'ru', 'uk');
export const PRINT_LANGUAGES = list('sk', 'cs', 'en', 'de');

export const DOCUMENT_TEMPLATES = list('CLASSIC', 'MODERN', 'MINIMAL', 'COMPACT');
