// Recurring invoices: the calendar (months of different length, 29
// February, thirteen months over a year end, weeks, end date and count),
// the document of a run, idempotency, and two devices generating the same
// run at once, merged by the sync.
import { describe, it, expect, vi } from 'vitest';
import { addMonths, runDate, periodOf, dueRuns, nextRunAfter, upcomingRuns, MAX_CATCH_UP } from './schedule.js';
import { buildRecurringDocument, alreadyGenerated, findRunDuplicates } from './generate.js';
import { runRecurring, seriesFor } from './runner.js';
import { Store, memoryAdapter } from '../../store/index.js';
import { mergeCompanyData } from '../../sync/merge.js';

const monthly = (over = {}) => ({ id: 't1', frequency: 'MONTH', interval: 1, firstRun: '2026-01-31', nextRun: '2026-01-31', active: true, history: [], docTemplate: { kind: 'INVOICE', lines: [] }, ...over });

describe('calendar', () => {
  it('keeps the day of the first run and cuts it in short months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
    const t = monthly();
    expect([0, 1, 2, 3].map(n => runDate(t, n))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('runs a 29 February template on the last day of February in other years', () => {
    const t = monthly({ frequency: 'YEAR', firstRun: '2028-02-29' });
    expect([0, 1, 4].map(n => runDate(t, n))).toEqual(['2028-02-29', '2029-02-28', '2032-02-29']);
  });

  it('generates thirteen monthly runs over the year end with their periods', () => {
    const t = monthly({ firstRun: '2026-10-05', nextRun: '2026-10-05' });
    const runs = dueRuns(t, '2027-10-05');
    expect(runs).toHaveLength(13);
    expect(runs[0]).toEqual({ n: 0, date: '2026-10-05', period: { start: '2026-10-01', end: '2026-10-31' } });
    expect(runs[3]).toEqual({ n: 3, date: '2027-01-05', period: { start: '2027-01-01', end: '2027-01-31' } });
    expect(runs[12].date).toBe('2027-10-05');
    expect(new Set(runs.map(r => r.period.start)).size).toBe(13);
  });

  it('covers quarters, half years, N months and weeks', () => {
    expect(periodOf(monthly({ frequency: 'QUARTER', firstRun: '2026-10-01' }), 1)).toEqual({ start: '2027-01-01', end: '2027-03-31' });
    expect(runDate(monthly({ frequency: 'HALF_YEAR', firstRun: '2026-08-31' }), 1)).toBe('2027-02-28');
    expect(runDate(monthly({ frequency: 'MONTHS', interval: 2, firstRun: '2026-11-30' }), 1)).toBe('2027-01-30');
    const week = monthly({ frequency: 'WEEK', interval: 2, firstRun: '2026-12-28' });
    expect(runDate(week, 1)).toBe('2027-01-11');
    expect(periodOf(week, 0)).toEqual({ start: '2026-12-28', end: '2027-01-10' });
  });

  it('respects the next run, pause, end date, count and the catch-up limit', () => {
    expect(dueRuns(monthly({ nextRun: '2026-03-31' }), '2026-04-29').map(r => r.date)).toEqual(['2026-03-31']);
    expect(dueRuns(monthly({ active: false }), '2026-12-31')).toEqual([]);
    expect(dueRuns(monthly({ endDate: '2026-03-01' }), '2026-12-31')).toHaveLength(2);
    expect(dueRuns(monthly({ maxCount: 3 }), '2026-12-31')).toHaveLength(3);
    expect(dueRuns(monthly({ firstRun: '2020-01-01', nextRun: '2020-01-01' }), '2026-12-31')).toHaveLength(MAX_CATCH_UP);
    expect(nextRunAfter(monthly({ maxCount: 3 }), 2)).toBe(null);
    expect(nextRunAfter(monthly(), 0)).toBe('2026-02-28');
    expect(upcomingRuns(monthly(), '2026-02-01', 2).map(r => r.date)).toEqual(['2026-02-28', '2026-03-31']);
  });

  it('does not run before the local date reaches the run day', () => {
    // 23:30 UTC on 4 October is already 5 October in Bratislava; the caller
    // passes the local date, so the run of the 5th is due then and not before.
    const t = monthly({ firstRun: '2026-10-05', nextRun: '2026-10-05' });
    expect(dueRuns(t, '2026-10-04')).toEqual([]);
    expect(dueRuns(t, '2026-10-05')).toHaveLength(1);
  });
});

describe('document of a run', () => {
  const company = { name: 'Alfa', defaults: { dueDays: 14, language: 'sk', currency: 'EUR' } };
  const template = monthly({
    firstRun: '2026-10-05', dueShiftDays: 10, taxDateAtPeriodEnd: true,
    docTemplate: { kind: 'INVOICE', contactId: 'c1', textIntro: 'Služby za {period}', lines: [{ id: 'x', kind: 'ITEM', name: 'Hosting {period}', qty: '1', unitPrice: '10', priceType: 'NET', vatCategory: 'S', vatRate: '23' }] }
  });
  it('fills dates, the period text in the document language and the run key', () => {
    let i = 0;
    const doc = buildRecurringDocument({ template, run: { date: '2026-10-05', period: { start: '2026-10-01', end: '2026-10-31' } }, company, contact: { language: 'en' }, newId: () => `id${++i}` });
    expect(doc).toMatchObject({
      kind: 'INVOICE', status: 'DRAFT', contactId: 'c1', issueDate: '2026-10-05', dueDate: '2026-10-15', taxDate: '2026-10-31',
      periodFrom: '2026-10-01', periodTo: '2026-10-31', language: 'en', textIntro: 'Služby za October 2026', recurringTemplateId: 't1', recurringPeriodStart: '2026-10-01'
    });
    expect(doc.lines[0]).toMatchObject({ id: 'id1', name: 'Hosting October 2026' });
  });
  it('knows a run made before, also from a deleted document', () => {
    expect(alreadyGenerated(template, [{ recurringTemplateId: 't1', recurringPeriodStart: '2026-10-01', deleted: true }], '2026-10-01')).toBe(true);
    expect(alreadyGenerated({ ...template, history: [{ periodStart: '2026-11-01', docId: 'd' }] }, [], '2026-11-01')).toBe(true);
    expect(alreadyGenerated(template, [], '2026-10-01')).toBe(false);
  });
  it('picks the same survivor of duplicates on every device', () => {
    const docs = [
      { id: 'b', recurringTemplateId: 't1', recurringPeriodStart: '2026-10-01', status: 'DRAFT', createdAt: '2026-10-05T08:00:00Z' },
      { id: 'a', recurringTemplateId: 't1', recurringPeriodStart: '2026-10-01', status: 'DRAFT', createdAt: '2026-10-05T08:00:00Z' },
      { id: 'c', recurringTemplateId: 't1', recurringPeriodStart: '2026-11-01', status: 'ISSUED' },
      { id: 'd', recurringTemplateId: 't1', recurringPeriodStart: '2026-11-01', status: 'ISSUED' },
      { id: 'e', recurringTemplateId: 't1', recurringPeriodStart: '2026-12-01', status: 'DRAFT' },
      { id: 'f', recurringTemplateId: 't1', recurringPeriodStart: '2026-12-01', status: 'ISSUED' }
    ];
    expect(findRunDuplicates(docs)).toEqual({ remove: ['b', 'e'], conflicts: [['c', 'd']] });
    expect(findRunDuplicates(docs.slice().reverse()).remove.sort()).toEqual(['b', 'e']);
  });
});

async function deviceStore(data) {
  const adapter = memoryAdapter();
  const store = new Store({ adapter, emit: () => {} });
  await store.open();
  if (data) {
    store.data = structuredClone(data);
    return store;
  }
  await store.createCompany({ name: 'Alfa s. r. o.', legalForm: 'SRO', taxpayerType: 'PO', vatMode: 'PAYER', accountingMode: 'NONE', defaults: { dueDays: 14, language: 'sk' }, series: [] });
  return store;
}

describe('runRecurring', () => {
  const template = { name: 'Hosting', frequency: 'MONTH', interval: 1, firstRun: '2026-10-05', nextRun: '2026-10-05', active: true, issueMode: 'DRAFT', history: [], generatedCount: 0, docTemplate: { kind: 'INVOICE', lines: [{ id: 'l', kind: 'ITEM', name: 'Hosting {period}', qty: '1', unitPrice: '10', priceType: 'NET', vatCategory: 'S', vatRate: '23' }] } };

  it('makes the due drafts once and moves the next run', async () => {
    const store = await deviceStore();
    const saved = await store.insert('recurringTemplates', template);
    const first = await runRecurring({ store, today: '2026-11-05' });
    expect(first.created.map(d => d.recurringPeriodStart)).toEqual(['2026-10-01', '2026-11-01']);
    expect(store.get('recurringTemplates', saved.id)).toMatchObject({ nextRun: '2026-12-05', generatedCount: 2 });
    const again = await runRecurring({ store, today: '2026-11-05' });
    expect(again.created).toEqual([]);
    expect(store.list('documents')).toHaveLength(2);
  });

  it('leaves a draft with a reason when there is no number series, and stops at the end', async () => {
    const store = await deviceStore();
    const saved = await store.insert('recurringTemplates', { ...template, issueMode: 'ISSUE', maxCount: 1 });
    const result = await runRecurring({ store, today: '2026-12-31' });
    expect(result.errors).toEqual([{ templateId: saved.id, code: 'NO_SERIES' }]);
    expect(store.list('documents')[0].status).toBe('DRAFT');
    expect(store.get('recurringTemplates', saved.id).active).toBe(false);
    expect(seriesFor({ series: [{ id: 's', kind: 'INVOICE' }] }, 'INVOICE').id).toBe('s');
  });

  it('issues and sends when the template asks and the company can', async () => {
    const store = await deviceStore();
    await store.updateCompany({
      ico: '12345679', dic: '2020000004', icDph: 'SK2020000004', registerEntry: 'OR', address: { street: 'Hlavná 1', city: 'Bratislava', zip: '81101', country: 'SK' },
      series: [{ id: 's1', name: 'FA', kind: 'INVOICE', mask: 'FA{YYYY}{N:4}', reset: 'YEARLY', isDefault: true, counters: {} }]
    });
    const contact = await store.insert('contacts', { kind: 'COMPANY', name: 'Beta', country: 'SK', billingAddress: { street: 'Mlynská 5', city: 'Košice', zip: '04001', country: 'SK' }, emails: [{ address: 'b@beta.sk' }] });
    await store.insert('recurringTemplates', { ...template, issueMode: 'ISSUE', autoSend: true, docTemplate: { ...template.docTemplate, contactId: contact.id } });
    const send = vi.fn(async () => ({ result: 'SENT' }));
    const result = await runRecurring({ store, today: '2026-10-05', send });
    expect(result).toMatchObject({ issued: 1, sent: 1, waiting: [] });
    expect(store.list('documents')[0]).toMatchObject({ status: 'ISSUED', number: 'FA20260001' });
    expect(store.company().series[0].counters).toEqual({ 2026: 2 });
    const noSmtp = await deviceStore();
    await noSmtp.updateCompany({ ...store.company(), id: noSmtp.company().id });
    await noSmtp.insert('contacts', { ...contact });
    await noSmtp.insert('recurringTemplates', { ...template, issueMode: 'ISSUE', autoSend: true, docTemplate: { ...template.docTemplate, contactId: contact.id } });
    expect((await runRecurring({ store: noSmtp, today: '2026-10-05', send: async () => null })).waiting).toHaveLength(1);
  });

  it('keeps one draft when two devices generate the same run at once', async () => {
    const a = await deviceStore();
    const t = await a.insert('recurringTemplates', template);
    const b = await deviceStore(a.data);
    await runRecurring({ store: a, today: '2026-10-05' });
    await runRecurring({ store: b, today: '2026-10-05' });
    const ids = [a.list('documents')[0].id, b.list('documents')[0].id];
    expect(ids[0]).not.toBe(ids[1]);
    const merged = mergeCompanyData(a.data, b.data).data;
    expect(merged.documents.filter(d => !d.deleted)).toHaveLength(2);
    const c = await deviceStore(merged);
    const result = await runRecurring({ store: c, today: '2026-10-05' });
    expect(result).toMatchObject({ removed: 1, created: [] });
    expect(c.list('documents')).toHaveLength(1);
    expect(c.list('documents')[0].recurringTemplateId).toBe(t.id);
    const d = await deviceStore(mergeCompanyData(b.data, a.data).data);
    await runRecurring({ store: d, today: '2026-10-05' });
    expect(d.list('documents')[0].id).toBe(c.list('documents')[0].id);
  });
});

describe('template form data', async () => {
  const { normalizeTemplate, nextRunOnSave, blankTemplate } = await import('./model.js');
  it('checks the template and drops automatic e-mail for drafts', () => {
    const { errors } = normalizeTemplate(blankTemplate('2026-10-05', { interval: 0, frequency: 'MONTHS', maxCount: '0', dueShiftDays: '-2' }));
    expect(errors).toEqual({ contact: 'CONTACT_REQUIRED', interval: 'INTERVAL_INVALID', maxCount: 'INTERVAL_INVALID', dueShiftDays: 'DUE_DAYS_INVALID', lines: 'LINES_REQUIRED' });
    const ok = normalizeTemplate(blankTemplate('2026-10-05', { autoSend: true, interval: 5, docTemplate: { kind: 'INVOICE', contactId: 'c', lines: [{ id: 'l' }] } }));
    expect(ok.errors).toEqual({});
    expect(ok.template).toMatchObject({ autoSend: false, interval: 1, issueMode: 'DRAFT' });
  });
  it('continues an edited schedule from today and keeps an unchanged one', () => {
    const prev = { frequency: 'MONTH', interval: 1, firstRun: '2026-01-10', nextRun: '2026-11-10', generatedCount: 10 };
    expect(nextRunOnSave(null, { firstRun: '2026-10-05' }, '2026-10-18')).toBe('2026-10-05');
    expect(nextRunOnSave(prev, { ...prev }, '2026-10-18')).toBe('2026-11-10');
    expect(nextRunOnSave(prev, { ...prev, firstRun: '2026-01-25' }, '2026-10-18')).toBe('2026-10-25');
    expect(nextRunOnSave({ ...prev, generatedCount: 0 }, { ...prev, firstRun: '2026-01-25' }, '2026-10-18')).toBe('2026-01-25');
  });
});
