// The document of one run of a recurring invoice, as a pure function: the
// template's lines and texts with {period} written out in the language of
// the document ("október 2026"), the issue date of the run, the due date
// shifted by the template, the client's or the company's due days, the
// date of supply at the end of the period when asked for, and the pair
// recurringTemplateId + recurringPeriodStart that makes the run unique.
// Duplicates that two devices made at the same time are found here too.
import { periodLabel } from '../../mail/placeholders.js';
import { addDays } from './schedule.js';

const DEFAULT_DUE_DAYS = 14;

const replacePeriod = (text, label) => (typeof text === 'string' ? text.replace(/\{period\}/g, label) : text);

export function documentLanguageFor(template, contact, company) {
  return template.docTemplate?.language || contact?.language || company?.defaults?.language || 'sk';
}

/**
 * @param {{template: object, run: {date: string, period: {start: string, end: string}}, company: object,
 *          contact?: object|null, newId: () => string}} input
 * @returns {object} a draft document
 */
export function buildRecurringDocument({ template, run, company, contact = null, newId }) {
  const doc = template.docTemplate || {};
  const language = documentLanguageFor(template, contact, company);
  const label = periodLabel(run.period.start, run.period.end, language);
  const dueDays = template.dueShiftDays ?? contact?.dueDays ?? company?.defaults?.dueDays ?? DEFAULT_DUE_DAYS;
  return {
    kind: doc.kind || 'INVOICE',
    status: 'DRAFT',
    number: null,
    contactId: doc.contactId || null,
    currency: doc.currency || contact?.currency || company?.defaults?.currency || 'EUR',
    language,
    paymentMethod: doc.paymentMethod || company?.defaults?.paymentMethod || 'TRANSFER',
    bankAccountId: doc.bankAccountId || null,
    issueDate: run.date,
    taxDate: template.taxDateAtPeriodEnd ? run.period.end : run.date,
    dueDate: addDays(run.date, Number(dueDays) || 0),
    periodFrom: run.period.start,
    periodTo: run.period.end,
    lines: (doc.lines || []).map(line => ({ ...line, id: newId(), name: replacePeriod(line.name, label), description: replacePeriod(line.description, label) })),
    textIntro: replacePeriod(doc.textIntro ?? null, label),
    textOutro: replacePeriod(doc.textOutro ?? null, label),
    payments: [],
    sendLog: [],
    links: [],
    recurringTemplateId: template.id,
    recurringPeriodStart: run.period.start
  };
}

// The key of a generated document, or null for any other document.
export function runKey(document) {
  return document.recurringTemplateId && document.recurringPeriodStart ? `${document.recurringTemplateId}|${document.recurringPeriodStart}` : null;
}

// True when the run was made already, on this device or another one. A
// deleted document counts too: the user removed it on purpose.
export function alreadyGenerated(template, documents, periodStart) {
  return (template.history || []).some(h => h.periodStart === periodStart)
    || documents.some(d => d.recurringTemplateId === template.id && d.recurringPeriodStart === periodStart);
}

/**
 * Documents of the same run made twice (two devices generating at once,
 * merged by the sync). The one to keep: an issued document over a draft,
 * then the older, then the lower id, so every device decides the same.
 * Drafts among the others can be removed; two issued documents of one
 * run are a conflict for the user.
 * @returns {{remove: string[], conflicts: string[][]}}
 */
export function findRunDuplicates(documents) {
  const groups = new Map();
  documents.filter(d => !d.deleted).forEach(d => {
    const key = runKey(d);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  });
  const remove = [];
  const conflicts = [];
  groups.forEach(list => {
    if (list.length < 2) return;
    const sorted = list.slice().sort((a, b) => (a.status === 'DRAFT') - (b.status === 'DRAFT')
      || String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));
    const others = sorted.slice(1);
    others.filter(d => d.status === 'DRAFT').forEach(d => remove.push(d.id));
    const issued = sorted.filter(d => d.status !== 'DRAFT');
    if (issued.length > 1) conflicts.push(issued.map(d => d.id));
  });
  return { remove, conflicts };
}
