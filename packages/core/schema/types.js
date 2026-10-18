// JSDoc typedefs of the data model, for editors and for reading. The JSON
// Schemas in ./entities are the source of truth; these mirror them.
//
// Conventions: ids are UUIDv7 strings; timestamps are ISO 8601 in UTC;
// calendar dates are "YYYY-MM-DD" without a time zone; amounts, quantities
// and rates are decimal strings ("1234.50", "23").

/**
 * @typedef {string} Decimal  Decimal number as a string, e.g. "1234.50".
 * @typedef {string} IsoDate  Calendar date "YYYY-MM-DD".
 * @typedef {string} IsoDateTime  Timestamp in UTC, e.g. "2026-10-18T09:41:00.000Z".
 */

/**
 * @typedef {object} BaseRecord
 * @property {string} id
 * @property {IsoDateTime} createdAt
 * @property {IsoDateTime} updatedAt
 * @property {boolean} [deleted]  Tombstone: kept so the deletion syncs.
 */

/**
 * @typedef {object} Address
 * @property {string} [street]
 * @property {string} [city]
 * @property {string} [zip]
 * @property {string} [country]  ISO 3166-1 alpha-2.
 */

/**
 * @typedef {object} Series
 * @property {string} id
 * @property {string} kind  One of DOCUMENT_KINDS.
 * @property {string} mask  E.g. "FA{YYYY}{N:4}".
 * @property {string|null} [vsMask]
 * @property {'YEARLY'|'MONTHLY'|'NEVER'} reset
 * @property {boolean} [isDefault]
 * @property {Object<string, number>} [counters]  Next number per period key.
 */

/**
 * @typedef {BaseRecord & {
 *   name: string, legalForm: string, taxpayerType: 'FO'|'PO', ico?: string|null, dic?: string|null,
 *   icDph?: string|null, vatMode: 'PAYER'|'REGISTERED_7'|'NONPAYER', vatPeriod?: 'MONTH'|'QUARTER',
 *   cashBasis?: boolean, oss?: boolean, registerEntry?: string|null, address?: Address,
 *   bankAccounts?: Array<{id: string, iban: string, bic?: string|null, currency: string, isDefault?: boolean, name?: string}>,
 *   accountingMode: 'NONE'|'TAX_RECORDS_FLAT'|'SIMPLE'|'EXTERNAL', peppol?: object, secrets?: object,
 *   defaults?: object, series?: Series[]
 * }} Company
 */

/**
 * @typedef {BaseRecord & {
 *   kind: 'COMPANY'|'PERSON', name: string, ico?: string|null, dic?: string|null, icDph?: string|null,
 *   country?: string, billingAddress?: Address, emails?: Array<{address: string, purposes?: string[]}>,
 *   dueDays?: number|null, language?: string|null, currency?: string|null, peppolId?: string|null
 * }} Contact
 */

/**
 * @typedef {object} DocumentLine
 * @property {string} id
 * @property {'ITEM'|'TEXT'|'SUBTOTAL'} [kind]
 * @property {string} name
 * @property {Decimal} qty
 * @property {Decimal} unitPrice
 * @property {Decimal|null} [baseQty]
 * @property {'NET'|'GROSS'} [priceType]
 * @property {Decimal|null} [discountPct]
 * @property {Decimal|null} [vatRate]
 * @property {'S'|'Z'|'E'|'AE'|'K'|'G'|'O'} vatCategory
 * @property {string|null} [exemptionReasonCode]
 * @property {string|null} [exemptionReasonText]
 */

/**
 * @typedef {object} Totals  EN 16931 document totals.
 * @property {Decimal} lineNet  BT-106
 * @property {Decimal} allowances  BT-107
 * @property {Decimal} charges  BT-108
 * @property {Decimal} net  BT-109
 * @property {Decimal} vat  BT-110
 * @property {Decimal|null} [vatEur]  BT-111
 * @property {Decimal} gross  BT-112
 * @property {Decimal} prepaid  BT-113
 * @property {Decimal} rounding  BT-114
 * @property {Decimal} payable  BT-115
 * @property {Array<{category: string, rate: Decimal|null, base: Decimal, vat: Decimal}>} breakdown  BG-23
 */

/**
 * @typedef {BaseRecord & {
 *   kind: string, status: string, seriesId?: string|null, number?: string|null, vs?: string|null,
 *   issueDate?: IsoDate|null, taxDate?: IsoDate|null, dueDate?: IsoDate|null, currency: string,
 *   fxRate?: Decimal|null, seller?: object, buyer?: object, contactId?: string|null,
 *   lines: DocumentLine[], docDiscount?: {pct?: Decimal|null, amount?: Decimal|null}|null,
 *   totals?: Totals|null, payments?: Array<object>, links?: Array<object>, peppol?: object|null,
 *   lockedAt?: IsoDateTime|null, language?: string, template?: string
 * }} Document
 */

/**
 * @typedef {object} CompanyData  Root of <companyId>/data.json.
 * @property {number} schemaVersion
 * @property {string} companyId
 * @property {Company} company
 * @property {Contact[]} contacts
 * @property {Document[]} documents
 */

export {};
