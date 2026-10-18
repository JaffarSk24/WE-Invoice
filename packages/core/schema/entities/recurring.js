// RecurringTemplate: a document generated on a schedule. The pair
// templateId + periodStart identifies one generated document, so running the
// schedule twice (or on two devices) never makes a duplicate.
import { entity, enumOf, object, DATE, NULLABLE_DATE, SHORT_TEXT, STRING_LIST, NULLABLE_TEXT, ID } from '../common.js';
import { RECURRING_FREQUENCIES } from '../enums.js';
import { documentSchema } from './document.js';

export const recurringTemplateSchema = entity('RecurringTemplate', {
  name: SHORT_TEXT,
  // A document without number, dates and status: the generator fills them.
  docTemplate: { type: 'object', properties: { kind: documentSchema.properties.kind, lines: documentSchema.properties.lines } },
  frequency: enumOf(RECURRING_FREQUENCIES),
  interval: { type: 'integer', minimum: 1, maximum: 120 },
  firstRun: DATE,
  nextRun: DATE,
  endDate: NULLABLE_DATE,
  maxCount: { type: ['integer', 'null'], minimum: 1 },
  generatedCount: { type: 'integer', minimum: 0 },
  dueShiftDays: { type: ['integer', 'null'] },
  taxDateAtPeriodEnd: { type: 'boolean' },
  autoSend: { type: 'boolean' },
  sendVia: { type: 'array', items: { enum: ['EMAIL', 'PEPPOL'] } },
  emailTo: STRING_LIST,
  copyToSelf: { type: 'boolean' },
  periodText: NULLABLE_TEXT,
  active: { type: 'boolean' },
  history: { type: 'array', items: object({ periodStart: DATE, docId: ID }, ['periodStart', 'docId']) }
}, ['docTemplate', 'frequency', 'nextRun', 'active']);
