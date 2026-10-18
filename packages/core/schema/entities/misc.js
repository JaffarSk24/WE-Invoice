// Reminder policy, e-mail templates and the audit log.
import { entity, object, enumOf, ID, NULLABLE_ID, SHORT_TEXT, TEXT, NULLABLE_DECIMAL, DATE_TIME } from '../common.js';
import { DOCUMENT_KINDS, PRINT_LANGUAGES, AUDIT_ACTIONS } from '../enums.js';

export const reminderPolicySchema = entity('ReminderPolicy', {
  enabled: { type: 'boolean' },
  beforeDueDays: { type: ['integer', 'null'], minimum: 0 },
  levels: {
    type: 'array',
    maxItems: 3,
    items: object({ afterDays: { type: 'integer', minimum: 0 }, templateId: NULLABLE_ID }, ['afterDays'])
  },
  minAmount: NULLABLE_DECIMAL,
  skipWeekends: { type: 'boolean' },
  includeProformas: { type: 'boolean' },
  lateInterest: { type: 'boolean' },
  recoveryCostFlat: { type: 'boolean' },
  thankYou: { type: 'boolean' }
}, ['enabled', 'levels']);

export const emailTemplateSchema = entity('EmailTemplate', {
  name: SHORT_TEXT,
  docKind: { enum: [...DOCUMENT_KINDS, null] },
  purpose: { enum: ['SEND', 'REMINDER_0', 'REMINDER_1', 'REMINDER_2', 'REMINDER_3', 'THANK_YOU'] },
  language: enumOf(PRINT_LANGUAGES),
  subject: SHORT_TEXT,
  body: TEXT
}, ['purpose', 'language', 'subject', 'body']);

export const auditEntrySchema = entity('AuditEntry', {
  at: DATE_TIME,
  actor: { type: ['string', 'null'], maxLength: 320 },
  device: { type: ['string', 'null'], maxLength: 120 },
  action: enumOf(AUDIT_ACTIONS),
  entity: { type: 'string', maxLength: 40 },
  entityId: ID,
  changes: { type: 'array', items: object({ field: SHORT_TEXT, from: {}, to: {} }, ['field']) },
  reason: { type: ['string', 'null'], maxLength: 2000 }
}, ['at', 'action', 'entity', 'entityId']);

