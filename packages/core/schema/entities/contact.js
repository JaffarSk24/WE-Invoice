// Contact (adresár): a customer or supplier.
import {
  entity, enumOf, SHORT_TEXT, TEXT, COUNTRY, CURRENCY, ADDRESS, NULLABLE_ID, NULLABLE_DATE_TIME,
  STRING_LIST, CHECKED_VALUE, NULLABLE_DECIMAL
} from '../common.js';
import { CONTACT_KINDS, PRINT_LANGUAGES } from '../enums.js';

export const contactSchema = entity('Contact', {
  kind: enumOf(CONTACT_KINDS),
  name: SHORT_TEXT,
  ico: { type: ['string', 'null'], maxLength: 20 },
  dic: { type: ['string', 'null'], maxLength: 20 },
  icDph: { type: ['string', 'null'], maxLength: 20 },
  country: COUNTRY,
  billingAddress: ADDRESS,
  deliveryAddresses: { type: 'array', items: { ...ADDRESS, properties: { ...ADDRESS.properties, name: SHORT_TEXT } } },
  // Each e-mail says what it is for: invoices, reminders, accountant copy.
  emails: {
    type: 'array',
    items: {
      type: 'object',
      properties: { address: { type: 'string', maxLength: 320 }, purposes: STRING_LIST },
      required: ['address']
    }
  },
  phone: { type: ['string', 'null'], maxLength: 50 },
  iban: { type: ['string', 'null'], maxLength: 34 },
  dueDays: { type: ['integer', 'null'], minimum: 0, maximum: 3650 },
  discountPct: NULLABLE_DECIMAL,
  language: { enum: [...PRINT_LANGUAGES, null] },
  currency: { ...CURRENCY, type: ['string', 'null'] },
  sendReminders: { type: 'boolean' },
  priceLevelId: NULLABLE_ID,
  peppolId: { type: ['string', 'null'], maxLength: 100 },
  peppolCapable: { anyOf: [CHECKED_VALUE, { type: 'null' }] },
  vatReliability: { anyOf: [CHECKED_VALUE, { type: 'null' }] },
  tags: STRING_LIST,
  note: TEXT,
  anonymizedAt: NULLABLE_DATE_TIME
}, ['kind', 'name']);
