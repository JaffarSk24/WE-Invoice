// Bank statement lines and cash books (03-features.md § 3.9).
import { entity, object, enumOf, ID, NULLABLE_ID, SHORT_TEXT, NULLABLE_TEXT, DECIMAL, DATE, CURRENCY } from '../common.js';

export const bankAccountTxSchema = entity('BankAccountTx', {
  accountId: ID,
  date: DATE,
  amount: DECIMAL,
  currency: CURRENCY,
  counterpartyName: { type: ['string', 'null'], maxLength: 500 },
  counterpartyIban: { type: ['string', 'null'], maxLength: 34 },
  vs: { type: ['string', 'null'], maxLength: 10 },
  ks: { type: ['string', 'null'], maxLength: 4 },
  ss: { type: ['string', 'null'], maxLength: 10 },
  message: NULLABLE_TEXT,
  ref: { type: ['string', 'null'], maxLength: 200 },
  // Import is idempotent on account + date + amount + ref.
  importKey: { type: 'string', maxLength: 300 },
  importId: NULLABLE_ID,
  matched: {
    anyOf: [object({
      docId: ID,
      confidence: { type: 'integer', minimum: 0, maximum: 100 },
      confirmed: { type: 'boolean' }
    }, ['docId', 'confidence']), { type: 'null' }]
  }
}, ['accountId', 'date', 'amount', 'currency', 'importKey']);

export const cashRegisterBookSchema = entity('CashRegisterBook', {
  name: SHORT_TEXT,
  currency: CURRENCY,
  openingBalance: DECIMAL,
  allowNegative: { type: 'boolean' },
  seriesInId: NULLABLE_ID,
  seriesOutId: NULLABLE_ID,
  kind: enumOf(['CASH'])
}, ['name', 'currency']);
