// Making the due runs of recurring invoices: on start, when a company
// opens, and when the desktop scheduler wakes the page (hourly). For each
// active template the runs up to today are made once: a draft, or an
// issued document when the template says so and the company has a number
// series for the kind; then e-mailed automatically when the template asks
// and an SMTP account exists. Duplicate drafts of one run, made by two
// devices at once and merged by the sync, are removed first.
import { issueDocument, uuidv7 } from '@we-invoice/core';
import { dueRuns, nextRunAfter } from './schedule.js';
import { buildRecurringDocument, alreadyGenerated, findRunDuplicates } from './generate.js';

// The default series of a kind, or null.
export function seriesFor(company, kind) {
  const list = (company && company.series) || [];
  return list.find(s => s.kind === kind && s.isDefault) || list.find(s => s.kind === kind) || null;
}

// Issues a draft through the core; returns { document, error }.
export async function issueGenerated(store, draft, contact) {
  const company = store.company();
  const series = seriesFor(company, draft.kind);
  if (!series) return { document: draft, error: 'NO_SERIES' };
  const taken = store.list('documents').filter(d => d.seriesId === series.id && d.number).map(d => d.number);
  try {
    const { document, series: next } = issueDocument(draft, { company, contact, series, taken, today: draft.issueDate });
    await store.updateCompany({ series: company.series.map(s => (s.id === next.id ? next : s)) });
    return { document, error: null };
  } catch (e) {
    console.warn('A recurring invoice could not be issued, it stays a draft', e);
    return { document: draft, error: e.code || 'ISSUE_FAILED' };
  }
}

export async function removeDuplicateDrafts(store) {
  const { remove, conflicts } = findRunDuplicates(store.list('documents'));
  for (const id of remove) await store.remove('documents', id);
  if (conflicts.length) console.warn('Recurring runs issued twice', conflicts);
  return { removed: remove.length, conflicts };
}

/**
 * @param {{store: object, today: string, send?: (store, document) => Promise<object|null>}} input
 *   send: automatic e-mail; resolves to the log entry or null when it cannot send
 * @returns {Promise<{created: object[], issued: number, sent: number, waiting: object[], errors: object[], removed: number}>}
 */
export async function runRecurring({ store, today, send = null }) {
  const result = { created: [], issued: 0, sent: 0, waiting: [], errors: [], removed: 0 };
  if (!store || !store.company() || store.readOnly) return result;
  result.removed = (await removeDuplicateDrafts(store)).removed;
  for (const template of store.list('recurringTemplates')) {
    const runs = dueRuns(template, today);
    if (!runs.length) continue;
    const contact = template.docTemplate?.contactId ? store.get('contacts', template.docTemplate.contactId) : null;
    const history = [...(template.history || [])];
    let generated = template.generatedCount || 0;
    for (const run of runs) {
      const all = store.list('documents', { includeDeleted: true });
      if (alreadyGenerated({ ...template, history }, all, run.period.start)) continue;
      let doc = buildRecurringDocument({ template, run, company: store.company(), contact, newId: uuidv7 });
      if (template.issueMode === 'ISSUE') {
        const issued = await issueGenerated(store, doc, contact);
        doc = issued.document;
        if (issued.error) result.errors.push({ templateId: template.id, code: issued.error });
        else result.issued += 1;
      }
      const saved = await store.insert('documents', doc);
      history.push({ periodStart: run.period.start, docId: saved.id });
      generated += 1;
      result.created.push(saved);
      if (template.autoSend && saved.status !== 'DRAFT') {
        let entry = null;
        try {
          entry = send ? await send(store, saved) : null;
        } catch (e) {
          console.error('Automatic sending of a recurring invoice failed', e);
          result.errors.push({ templateId: template.id, code: e.code || 'MAIL_FAILED' });
        }
        if (entry && entry.result === 'SENT') result.sent += 1; else result.waiting.push(saved);
      }
    }
    const last = runs[runs.length - 1];
    const next = nextRunAfter(template, last.n);
    await store.update('recurringTemplates', template.id, {
      history, generatedCount: generated, nextRun: next || last.date, active: next ? template.active !== false : false, finished: !next
    });
  }
  return result;
}
