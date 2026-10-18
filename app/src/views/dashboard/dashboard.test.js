// Dashboard logic: layout changes, the numbers of the widgets and the tax
// calendar from the legislation file.
import { describe, it, expect } from 'vitest';
import { WIDGETS, normalizeLayout, visibleWidgets, moveWidget, placeWidget, hideWidget, showWidget } from './layout.js';
import { issuedSummary, unpaidSummary, ageBucket, topClients, topDebtors, balanceSummary, vatThresholdSummary, outstanding } from './metrics.js';
import { taxCalendar, validEntry, vatThresholdFor, deadlinesFor } from './tax-calendar.js';

describe('layout', () => {
  it('repairs saved layouts', () => {
    expect(normalizeLayout(null).order).toEqual(WIDGETS);
    const l = normalizeLayout({ order: ['unpaid', 'nope', 'unpaid'], hidden: ['issued', 'nope'] });
    expect(l.order[0]).toBe('unpaid');
    expect(l.order).toHaveLength(WIDGETS.length);
    expect(l.hidden).toEqual(['issued']);
  });
  it('moves, places, hides and shows', () => {
    let l = normalizeLayout(null);
    l = moveWidget(l, 'issued', -1);
    expect(l.order[0]).toBe('issued');
    expect(moveWidget(l, 'issued', -1)).toBe(l);
    l = placeWidget(l, 'accounts', 'issued');
    expect(l.order[0]).toBe('accounts');
    l = hideWidget(l, 'accounts');
    expect(visibleWidgets(l)).not.toContain('accounts');
    l = showWidget(l, 'accounts');
    expect(visibleWidgets(l)).toContain('accounts');
  });
});

const doc = (p) => ({ kind: 'INVOICE', status: 'SENT', contactId: 'a', contactName: 'A', totalNet: '100.00', totalGross: '123.00', paidAmount: '0.00', ...p });

describe('metrics', () => {
  const today = '2026-10-18';
  const docs = [
    doc({ issueDate: '2026-10-01', dueDate: '2026-10-15', status: 'OVERDUE' }),
    doc({ issueDate: '2026-08-01', dueDate: '2026-08-15', contactId: 'b', contactName: 'B', status: 'PARTIALLY_PAID', paidAmount: '23.00' }),
    doc({ issueDate: '2026-03-01', dueDate: '2026-03-15', status: 'PAID', paidAmount: '123.00' }),
    doc({ issueDate: '2025-10-05', dueDate: '2025-10-19', status: 'PAID', paidAmount: '123.00' }),
    doc({ issueDate: '2026-10-02', dueDate: '2026-10-30', status: 'DRAFT' }),
    doc({ issueDate: '2026-05-01', dueDate: '2026-05-15', kind: 'RECEIVED_INVOICE', status: 'PAID', totalNet: '40.00' })
  ];
  it('sums issued sales without drafts', () => {
    const s = issuedSummary(docs, today);
    expect(s.month).toMatchObject({ count: 1, gross: '123' });
    expect(s.year.count).toBe(3);
    expect(s.lastYear.gross).toBe('123');
  });
  it('splits unpaid by age', () => {
    expect(ageBucket('2026-10-15', today)).toBe('d1to15');
    expect(ageBucket('2026-09-10', today)).toBe('d31to60');
    expect(ageBucket('2026-08-15', today)).toBe('d60plus');
    expect(ageBucket('2026-10-20', today)).toBe(null);
    const u = unpaidSummary(docs, today);
    expect(u.count).toBe(2);
    expect(u.total).toBe('223');
    expect(u.buckets.d60plus.amount).toBe('100');
    expect(outstanding(doc({ paidAmount: '200' }))).toBe('0');
  });
  it('ranks clients and debtors and balances sales and purchases', () => {
    expect(topClients(docs, '2026')[0]).toMatchObject({ contactId: 'a', count: 2 });
    expect(topDebtors(docs, today).map(d => d.contactId)).toEqual(['a', 'b']);
    expect(balanceSummary(docs, '2026')).toEqual({ sales: '300', purchases: '40', balance: '260' });
  });
  it('warns at 80 % and 100 % of the VAT threshold', () => {
    const big = (net) => [doc({ issueDate: '2026-06-01', totalNet: net })];
    expect(vatThresholdSummary(big('10000'), today, '50000').level).toBe('ok');
    expect(vatThresholdSummary(big('40000'), today, '50000')).toMatchObject({ level: 'warn', percent: 80 });
    expect(vatThresholdSummary(big('50000'), today, '50000').level).toBe('over');
    expect(vatThresholdSummary([doc({ issueDate: '2025-09-01', totalNet: '90000' })], today, '50000').level).toBe('ok');
  });
});

describe('tax calendar', () => {
  it('reads limits and deadlines from the legislation file', () => {
    expect(vatThresholdFor('2026-10-18')).toBe('50000');
    expect(deadlinesFor('2026-10-18').vatReturnDay).toBe(25);
    expect(validEntry([{ validFrom: '2020-01-01', validTo: '2020-12-31' }], '2021-01-01')).toBe(null);
  });
  it('lists monthly VAT dates for a payer', () => {
    const events = taxCalendar({ company: { vatMode: 'PAYER', vatPeriod: 'MONTH' }, today: '2026-10-18' });
    expect(events[0]).toMatchObject({ due: '2026-10-25', daysLeft: 7 });
    expect(events.map(e => e.id)).toEqual(expect.arrayContaining(['vatReturn', 'kv']));
    expect(events.every(e => e.due >= '2026-10-18')).toBe(true);
  });
  it('uses quarters and year ends correctly', () => {
    const q = taxCalendar({ company: { vatMode: 'PAYER', vatPeriod: 'QUARTER' }, today: '2026-11-01' });
    expect(q.find(e => e.id === 'vatReturn').due).toBe('2027-01-25');
    const dec = taxCalendar({ company: { vatMode: 'PAYER', vatPeriod: 'MONTH' }, today: '2026-12-28' });
    expect(dec[0].due).toBe('2027-01-25');
  });
  it('has nothing for a non-payer until income tax dates are in the file', () => {
    expect(taxCalendar({ company: { vatMode: 'NONPAYER' }, today: '2026-10-18' })).toEqual([]);
    expect(taxCalendar({ company: { vatMode: 'REGISTERED_7' }, today: '2026-10-18' }).every(e => e.id === 'vatReturn')).toBe(true);
  });
});
