import { describe, it, expect } from 'vitest';
import { agingReport, agingBucket } from './aging.js';
import { cashflowForecast, recurringRuns, paymentDelays, addMonths } from './cashflow.js';
import { profitability, averagePurchasePrices } from './profit.js';

const totals = (gross) => ({ net: gross, vat: '0', gross, payable: gross });
const pay = (date, amount) => ({ id: `p${date}`, date, amount, method: 'TRANSFER', source: 'MANUAL' });
const inv = (over = {}) => ({
  id: 'x', kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', issueDate: '2026-09-01', dueDate: '2026-09-15', number: 'FA001',
  buyer: { name: 'Alfa' }, contactId: 'c1', lines: [], totals: totals('100.00'), payments: [], ...over
});

describe('agingReport', () => {
  const today = '2026-10-18';

  it('puts due dates into the buckets by the local date', () => {
    expect(agingBucket('2026-10-18', today)).toBe('current');
    expect(agingBucket('2026-10-17', today)).toBe('d1to15');
    expect(agingBucket('2026-10-03', today)).toBe('d1to15');
    expect(agingBucket('2026-10-02', today)).toBe('d16to30');
    expect(agingBucket('2026-09-18', today)).toBe('d16to30');
    expect(agingBucket('2026-09-17', today)).toBe('d31to60');
    expect(agingBucket('2026-08-19', today)).toBe('d31to60');
    expect(agingBucket('2026-08-18', today)).toBe('d60plus');
  });

  it('splits receivables and payables, counting only what is still due', () => {
    const docs = [
      inv({ id: 'a', dueDate: '2026-10-10', totals: totals('100.00') }),
      inv({ id: 'b', dueDate: '2026-07-01', totals: totals('250.00'), payments: [pay('2026-07-05', '50.00')] }),
      inv({ id: 'c', dueDate: '2026-10-30', totals: totals('40.00'), contactId: 'c2', buyer: { name: 'Beta' } }),
      inv({ id: 'd', dueDate: '2026-09-01', totals: totals('70.00'), payments: [pay('2026-09-02', '70.00')] }),
      inv({ id: 'e', status: 'DRAFT', dueDate: '2026-01-01' }),
      inv({ id: 'f', kind: 'PROFORMA', dueDate: '2026-01-01' }),
      inv({ id: 'g', kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS', seller: { name: 'Dodávateľ' }, contactId: 's1', dueDate: '2026-09-30', totals: totals('30.00') })
    ];
    const r = agingReport(docs, today);
    expect(r.receivables.total).toBe('340.00');
    expect(r.receivables.overdue).toBe('300.00');
    expect(r.receivables.buckets).toEqual({ current: '40.00', d1to15: '100.00', d16to30: '0.00', d31to60: '0.00', d60plus: '200.00' });
    expect(r.receivables.byContact[0]).toMatchObject({ name: 'Alfa', total: '300.00', count: 2, maxDays: 109 });
    expect(r.receivables.documents[0].id).toBe('b');
    expect(r.payables.total).toBe('30.00');
    expect(r.payables.buckets.d16to30).toBe('30.00');
  });

  it('needs the local date', () => {
    expect(() => agingReport([], null)).toThrow(/local date/);
  });
});

describe('cashflowForecast', () => {
  it('adds months keeping the day or the month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('lists the runs of a recurring template within the horizon and its limits', () => {
    const t = { active: true, frequency: 'MONTH', interval: 1, nextRun: '2026-11-01', maxCount: 5, generatedCount: 3 };
    expect(recurringRuns(t, '2027-06-30')).toEqual(['2026-11-01', '2026-12-01']);
    expect(recurringRuns({ ...t, maxCount: null, endDate: '2027-01-15' }, '2027-06-30')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01']);
    expect(recurringRuns({ ...t, frequency: 'WEEK', interval: 2, maxCount: null }, '2026-11-30')).toEqual(['2026-11-01', '2026-11-15', '2026-11-29']);
    expect(recurringRuns({ ...t, active: false }, '2027-06-30')).toEqual([]);
  });

  it('learns how late each client pays', () => {
    const delays = paymentDelays([
      inv({ id: 'a', dueDate: '2026-05-01', payments: [pay('2026-05-11', '100.00')] }),
      inv({ id: 'b', dueDate: '2026-06-01', payments: [pay('2026-06-21', '100.00')] }),
      inv({ id: 'c', dueDate: '2026-06-01', contactId: 'c2', payments: [pay('2026-05-25', '100.00')] })
    ]);
    expect(delays.get('c1')).toBe(15);
    expect(delays.get('c2')).toBe(0);
  });

  it('places open invoices, received invoices and recurring invoices by month', () => {
    const docs = [
      inv({ id: 'paid-late', dueDate: '2026-05-01', payments: [pay('2026-05-21', '100.00')], totals: totals('100.00') }),
      inv({ id: 'open', dueDate: '2026-10-25', totals: totals('500.00') }),
      inv({ id: 'overdue', dueDate: '2026-09-01', totals: totals('80.00'), contactId: 'c9', buyer: { name: 'Gama' } }),
      inv({ id: 'bill', kind: 'RECEIVED_INVOICE', status: 'PROCESSED', dueDate: '2026-12-10', totals: totals('120.00'), seller: { name: 'S' }, contactId: 's' })
    ];
    const templates = [{
      id: 'rt', name: 'Paušál', active: true, frequency: 'MONTH', interval: 1, nextRun: '2026-11-01', dueShiftDays: 10,
      docTemplate: { kind: 'INVOICE', lines: [{ id: 'l', name: 'Paušál', qty: '1', unitPrice: '200', vatCategory: 'S', vatRate: '23' }] }
    }];
    const r = cashflowForecast({ documents: docs, recurringTemplates: templates }, { today: '2026-10-18', months: 3, openingBalance: '1000' });
    expect(r.buckets.map(b => b.key)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01']);
    // "open" is due on 25 October but Alfa pays 20 days late: November.
    expect(r.buckets[0].inflow).toBe('80.00');
    expect(r.buckets[1].inflow).toBe('746.00');
    expect(r.buckets[2]).toMatchObject({ inflow: '246.00', outflow: '120.00', net: '126.00' });
    expect(r.overdueIn).toBe('80.00');
    expect(r.buckets[0].balance).toBe('1080.00');
    expect(r.until).toBe('2027-01-17');
    expect(r.items.find(i => i.id === 'open').date).toBe('2026-11-14');
  });

  it('sums by week when asked', () => {
    const r = cashflowForecast({ documents: [inv({ dueDate: '2026-10-20' })] }, { today: '2026-10-18', months: 1, granularity: 'week', useDelays: false });
    expect(r.buckets[0]).toMatchObject({ key: '2026-10-18', from: '2026-10-18', to: '2026-10-24', inflow: '100.00' });
  });
});

describe('profitability', () => {
  const line = (over) => ({ id: 'l', name: 'Tovar', qty: '1', unitPrice: '10', vatCategory: 'S', vatRate: '23', itemId: 'i1', ...over });
  const docs = [
    inv({ id: 'buy1', kind: 'RECEIVED_INVOICE', seller: { name: 'S' }, contactId: 's', issueDate: '2026-01-05', lines: [line({ qty: '10', unitPrice: '6' })], totals: totals('60.00') }),
    inv({ id: 'buy2', kind: 'RECEIVED_INVOICE', seller: { name: 'S' }, contactId: 's', issueDate: '2026-02-05', lines: [line({ qty: '10', unitPrice: '8' })], totals: totals('80.00'), projectRef: 'P' }),
    inv({ id: 'sell', issueDate: '2026-03-01', lines: [line({ qty: '5', unitPrice: '12' }), line({ id: 'l2', itemId: null, name: 'Práca', qty: '1', unitPrice: '40' })], totals: totals('100.00'), projectRef: 'P' })
  ];

  it('prices items at the average purchase price', () => {
    expect(averagePurchasePrices(docs).get('i1').toFixed()).toBe('7');
  });

  it('computes profit by item, client and project', () => {
    const r = profitability(docs, { from: '2026-01-01', to: '2026-12-31' });
    expect(r.byItem.find(i => i.itemId === 'i1')).toMatchObject({ revenue: '60.00', cost: '35.00', profit: '25.00', margin: '41.7', costKnown: true });
    expect(r.byItem.find(i => i.name === 'Práca').costKnown).toBe(false);
    expect(r.byContact[0]).toMatchObject({ name: 'Alfa', revenue: '100.00', cost: '35.00', costKnown: false });
    expect(r.byProject[0]).toMatchObject({ key: 'P', revenue: '100.00', cost: '80.00', profit: '20.00' });
  });
});
