// A recurring invoice template as plain data: a blank one, the checks
// before saving and the next run after an edit. A new template starts at
// its first run; an edited schedule continues from today, so changing the
// day of the month never makes up runs of the past twice (and the run key
// templateId + periodStart would refuse them anyway).
import { schema, isDate } from '@we-invoice/core';
import { runDate, runIndexFrom } from './schedule.js';

export const KINDS = Object.freeze(['INVOICE', 'PROFORMA']);
const SCHEDULE_FIELDS = ['frequency', 'interval', 'firstRun'];

export function blankTemplate(today, overrides = {}) {
  return {
    name: '', frequency: 'MONTH', interval: 1, firstRun: today, nextRun: today, endDate: null, maxCount: null,
    generatedCount: 0, dueShiftDays: null, taxDateAtPeriodEnd: false, issueMode: 'DRAFT', autoSend: false,
    sendVia: ['EMAIL'], emailTo: [], copyToSelf: false, periodText: null, active: true, history: [],
    docTemplate: { kind: 'INVOICE', contactId: null, language: null, textIntro: '', lines: [] },
    ...overrides
  };
}

const int = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

// Returns { template, errors } with error codes (crm.error.<CODE>).
export function normalizeTemplate(input) {
  const tpl = { ...blankTemplate(input.firstRun || ''), ...input };
  const errors = {};
  const interval = int(tpl.interval) ?? 1;
  const maxCount = int(tpl.maxCount);
  const dueShift = int(tpl.dueShiftDays);
  const out = {
    ...tpl,
    name: String(tpl.name || '').trim(),
    frequency: schema.RECURRING_FREQUENCIES.includes(tpl.frequency) ? tpl.frequency : 'MONTH',
    interval: tpl.frequency === 'MONTHS' || tpl.frequency === 'WEEK' ? interval : 1,
    endDate: tpl.endDate || null,
    maxCount,
    dueShiftDays: dueShift,
    issueMode: tpl.issueMode === 'ISSUE' ? 'ISSUE' : 'DRAFT',
    autoSend: tpl.issueMode === 'ISSUE' && tpl.autoSend === true,
    docTemplate: { ...tpl.docTemplate, kind: KINDS.includes(tpl.docTemplate?.kind) ? tpl.docTemplate.kind : 'INVOICE' }
  };
  if (!out.docTemplate.contactId) errors.contact = 'CONTACT_REQUIRED';
  if (!isDate(out.firstRun)) errors.firstRun = 'DATE_REQUIRED';
  if (!Number.isInteger(out.interval) || out.interval < 1 || out.interval > 120) errors.interval = 'INTERVAL_INVALID';
  if (out.endDate && !isDate(out.endDate)) errors.endDate = 'DATE_REQUIRED';
  if (maxCount !== null && (!Number.isInteger(maxCount) || maxCount < 1)) errors.maxCount = 'INTERVAL_INVALID';
  if (dueShift !== null && (!Number.isInteger(dueShift) || dueShift < 0 || dueShift > 3650)) errors.dueShiftDays = 'DUE_DAYS_INVALID';
  if (!(out.docTemplate.lines || []).length) errors.lines = 'LINES_REQUIRED';
  if (!out.name) out.name = '';
  return { template: out, errors };
}

// The next run to store after saving.
export function nextRunOnSave(previous, next, today) {
  if (!previous) return next.firstRun;
  const changed = SCHEDULE_FIELDS.some(f => String(previous[f]) !== String(next[f]));
  if (!changed) return previous.nextRun || next.firstRun;
  if (!(previous.generatedCount > 0)) return next.firstRun;
  const from = next.firstRun > today ? next.firstRun : today;
  return runDate(next, runIndexFrom(next, from));
}
