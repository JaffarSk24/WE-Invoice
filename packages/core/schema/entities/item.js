// Item (cenník): a price list entry, optionally tracked in stock.
import { entity, enumOf, SHORT_TEXT, TEXT, DECIMAL, NULLABLE_DECIMAL, CURRENCY } from '../common.js';
import { PRICE_TYPES, VAT_CATEGORIES } from '../enums.js';

export const itemSchema = entity('Item', {
  name: SHORT_TEXT,
  code: { type: ['string', 'null'], maxLength: 60 },
  barcode: { type: ['string', 'null'], maxLength: 60 },
  // UN/ECE Recommendation 20 code (C62, HUR, KGM...) plus the label shown.
  unit: { type: 'object', properties: { code: { type: 'string', maxLength: 3 }, label: SHORT_TEXT }, required: ['code'] },
  price: DECIMAL,
  priceType: enumOf(PRICE_TYPES),
  vatRate: NULLABLE_DECIMAL,
  vatCategory: enumOf(VAT_CATEGORIES),
  currency: CURRENCY,
  stockTracked: { type: 'boolean' },
  minStock: NULLABLE_DECIMAL,
  warehouseQty: { type: 'object', additionalProperties: DECIMAL },
  prices: { type: 'object', additionalProperties: DECIMAL },
  accountingCategory: { type: ['string', 'null'], maxLength: 60 },
  description: TEXT
}, ['name', 'price', 'priceType', 'vatCategory']);
