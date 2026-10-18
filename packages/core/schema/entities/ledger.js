// Bookkeeping for sole traders (05-accounting-tax.md § 5.4): the cash book
// of jednoduché účtovníctvo, fixed assets and the trip log.
import { entity, object, enumOf, NULLABLE_ID, SHORT_TEXT, NULLABLE_TEXT, DECIMAL, NULLABLE_DECIMAL, DATE, NULLABLE_DATE } from '../common.js';
import { LEDGER_DIRECTIONS, LEDGER_MEDIA, ASSET_KINDS, DEPRECIATION_METHODS } from '../enums.js';

export const ledgerEntrySchema = entity('LedgerEntry', {
  date: DATE,
  number: { type: ['string', 'null'], maxLength: 60 },
  direction: enumOf(LEDGER_DIRECTIONS),
  medium: enumOf(LEDGER_MEDIA),
  amount: DECIMAL,
  vat: NULLABLE_DECIMAL,
  // Column of the peňažný denník (e.g. INCOME_TAX_GOODS, EXPENSE_TAX_MATERIAL);
  // the list is defined by WP-LEDGER from the MF SR measure.
  category: { type: 'string', maxLength: 60 },
  taxRelevant: { type: 'boolean' },
  docId: NULLABLE_ID,
  paymentId: NULLABLE_ID,
  text: NULLABLE_TEXT,
  auto: { type: 'boolean' }
}, ['date', 'direction', 'medium', 'amount', 'category']);

export const assetSchema = entity('Asset', {
  name: SHORT_TEXT,
  inventoryNumber: { type: ['string', 'null'], maxLength: 60 },
  kind: enumOf(ASSET_KINDS),
  acquiredOn: DATE,
  inUseFrom: NULLABLE_DATE,
  cost: DECIMAL,
  depreciationGroup: { type: 'integer', minimum: 0, maximum: 6 },
  method: enumOf(DEPRECIATION_METHODS),
  disposedOn: NULLABLE_DATE,
  docId: NULLABLE_ID,
  plan: {
    type: 'array',
    items: object({ year: { type: 'integer' }, amount: DECIMAL, residual: DECIMAL, booked: { type: 'boolean' } }, ['year', 'amount'])
  }
}, ['name', 'kind', 'acquiredOn', 'cost', 'depreciationGroup', 'method']);

export const tripLogSchema = entity('TripLog', {
  date: DATE,
  vehicle: SHORT_TEXT,
  from: SHORT_TEXT,
  to: SHORT_TEXT,
  purpose: NULLABLE_TEXT,
  km: DECIMAL,
  odometerStart: NULLABLE_DECIMAL,
  odometerEnd: NULLABLE_DECIMAL,
  fuelCost: NULLABLE_DECIMAL,
  allowance: NULLABLE_DECIMAL,
  assetId: NULLABLE_ID,
  docId: NULLABLE_ID
}, ['date', 'km']);
