// Building blocks for the entity schemas (JSON Schema draft 2020-12).
// Every stored record carries id, createdAt, updatedAt and deleted: the sync
// engine merges by updatedAt and keeps deleted records as tombstones.
// Amounts, quantities and rates are decimal strings, never floats.

export const DECIMAL = { type: 'string', pattern: '^-?\\d+(\\.\\d+)?$' };
export const NULLABLE_DECIMAL = { type: ['string', 'null'], pattern: '^-?\\d+(\\.\\d+)?$' };
export const ID = { type: 'string', minLength: 1, maxLength: 64 };
export const NULLABLE_ID = { type: ['string', 'null'], maxLength: 64 };
export const DATE = { type: 'string', format: 'date' };
export const NULLABLE_DATE = { type: ['string', 'null'], format: 'date' };
export const DATE_TIME = { type: 'string', format: 'date-time' };
export const NULLABLE_DATE_TIME = { type: ['string', 'null'], format: 'date-time' };
export const CURRENCY = { type: 'string', pattern: '^[A-Z]{3}$' };
export const COUNTRY = { type: 'string', pattern: '^[A-Z]{2}$' };
export const TEXT = { type: 'string', maxLength: 10000 };
export const SHORT_TEXT = { type: 'string', maxLength: 500 };
export const NULLABLE_TEXT = { type: ['string', 'null'], maxLength: 10000 };
export const STRING_LIST = { type: 'array', items: SHORT_TEXT };

export function enumOf(values) {
  return { type: 'string', enum: [...values] };
}

export function nullableEnumOf(values) {
  return { enum: [...values, null] };
}

// Fields every stored record has.
export const BASE_PROPERTIES = {
  id: ID,
  createdAt: DATE_TIME,
  updatedAt: DATE_TIME,
  deleted: { type: 'boolean' }
};
export const BASE_REQUIRED = ['id', 'createdAt', 'updatedAt'];

// A stored entity: base fields plus its own. Unknown fields are allowed, so
// an older client keeps (and syncs back) what a newer one wrote.
export function entity(title, properties, required = []) {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title,
    type: 'object',
    properties: { ...BASE_PROPERTIES, ...properties },
    required: [...BASE_REQUIRED, ...required]
  };
}

// A value object nested inside an entity (no base fields of its own).
export function object(properties, required = []) {
  return { type: 'object', properties, required };
}

export const ADDRESS = object({
  street: SHORT_TEXT,
  city: SHORT_TEXT,
  zip: { type: 'string', maxLength: 20 },
  country: COUNTRY,
  region: SHORT_TEXT
});

export const BANK_ACCOUNT = object({
  id: ID,
  name: SHORT_TEXT,
  iban: { type: 'string', pattern: '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$' },
  bic: { type: ['string', 'null'], pattern: '^[A-Z0-9]{8}([A-Z0-9]{3})?$' },
  currency: CURRENCY,
  isDefault: { type: 'boolean' }
}, ['id', 'iban', 'currency']);

// Snapshot of a party's details on a document at the moment of issue.
export const PARTY_SNAPSHOT = object({
  contactId: NULLABLE_ID,
  name: SHORT_TEXT,
  ico: { type: ['string', 'null'], maxLength: 20 },
  dic: { type: ['string', 'null'], maxLength: 20 },
  icDph: { type: ['string', 'null'], maxLength: 20 },
  address: ADDRESS,
  registerEntry: NULLABLE_TEXT,
  email: { type: ['string', 'null'], maxLength: 320 },
  phone: { type: ['string', 'null'], maxLength: 50 },
  peppolId: { type: ['string', 'null'], maxLength: 100 },
  vatPayer: { type: 'boolean' }
}, ['name']);

// A check result that expires: VAT reliability, Peppol capability.
export const CHECKED_VALUE = object({
  value: {},
  status: { type: 'string', maxLength: 40 },
  checkedAt: DATE_TIME
}, ['checkedAt']);
