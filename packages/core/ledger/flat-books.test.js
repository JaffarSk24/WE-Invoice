import { describe, it, expect } from 'vitest';
import { flatExpenses, flatSummary, incomeRecords, activityMonths, incomeParagraph } from './flat.js';
import { receivablesBook, payablesBook } from './books.js';
import { mealAllowance, tripAllowance, tripAmount, tripRows, tripSummary } from './travel.js';

const income = (over) => ({ id: over.id || 'i', date: '2026-02-01', direction: 'INCOME', medium: 'BANK', amount: '1000', vat: null, category: 'INCOME_TAX_SERVICES', ...over });

describe('flatExpenses (§ 6 ods. 10)', () => {
  it('is 60 % of income', () => {
    expect(flatExpenses('10000', { year: 2026 })).toMatchObject({ expenses: '6000.00', capped: false, cap: '20000.00', pct: '60' });
  });

  it('stops at the cap exactly at the boundary', () => {
    expect(flatExpenses('33333.33', { year: 2026 }).expenses).toBe('20000.00');
    expect(flatExpenses('33333.33', { year: 2026 }).capped).toBe(false);
    expect(flatExpenses('33333.35', { year: 2026 })).toMatchObject({ expenses: '20000.00', capped: true });
  });

  it('does not cut the cap by months under the current law', () => {
    expect(flatExpenses('100000', { year: 2026, startDate: '2026-10-15' })).toMatchObject({ expenses: '20000.00', months: 3 });
  });

  it('gives nothing for no or negative income and refuses a bad year', () => {
    expect(flatExpenses('-5', { year: 2026 }).expenses).toBe('0.00');
    expect(() => flatExpenses('1', { year: 'x' })).toThrow(expect.objectContaining({ code: 'LEDGER_YEAR_INVALID' }));
    expect(() => flatExpenses('1', { year: 2022 })).toThrow(expect.objectContaining({ code: 'LEGISLATION_NOT_IN_FORCE' }));
  });

  it('counts started months of activity', () => {
    expect(activityMonths(2026)).toBe(12);
    expect(activityMonths(2026, '2026-03-31')).toBe(10);
    expect(activityMonths(2026, '2025-05-01', '2026-02-01')).toBe(2);
    expect(activityMonths(2026, '2027-01-01')).toBe(0);
  });
});

describe('tax records with flat expenses', () => {
  const entries = [
    income({ id: 'b', date: '2026-03-01', amount: '1230', vat: '230' }),
    income({ id: 'a', date: '2026-01-05', amount: '500', medium: 'CASH' }),
    income({ id: 'w', date: '2026-04-01', amount: '2000', incomeParagraph: '6_4' }),
    income({ id: 'n', date: '2026-04-02', amount: '9999', category: 'INCOME_NONTAX' }),
    income({ id: 'o', date: '2025-12-31', amount: '7777' }),
    { id: 's', date: '2026-01-08', direction: 'EXPENSE', medium: 'BANK', amount: '250', category: 'EXPENSE_TAX_INSURANCE' },
    { id: 'z', date: '2026-02-08', direction: 'EXPENSE', medium: 'BANK', amount: '300', category: 'EXPENSE_TAX_SERVICES' }
  ];

  it('lists tax income in date order without VAT', () => {
    const r = incomeRecords(entries, 2026);
    expect(r.rows.map(x => [x.id, x.amount, x.running])).toEqual([['a', '500.00', '500.00'], ['b', '1000.00', '1500.00'], ['w', '2000.00', '3500.00']]);
    expect(r.total).toBe('3500.00');
  });

  it('builds table 1 of DPFO typ B with insurance on top', () => {
    const s = flatSummary({ entries, year: 2026 });
    expect(s.rows).toEqual([{ paragraph: '6_1_AB', income: '1500.00', expenses: '900.00' }, { paragraph: '6_4', income: '2000.00', expenses: '1200.00' }]);
    expect(s.insurance).toBe('250.00');
    expect(s.income).toBe('3500.00');
    expect(s.expenses).toBe('2350.00');
    expect(s.base).toBe('1150.00');
  });

  it('caps the § 6 ods. 4 group apart', () => {
    const big = [income({ amount: '40000' }), income({ id: 'w', amount: '40000', incomeParagraph: '6_4' })];
    const s = flatSummary({ entries: big, year: 2026 });
    expect(s.groups.map(g => g.expenses)).toEqual(['20000.00', '20000.00']);
  });

  it('defaults the paragraph of an income', () => {
    expect(incomeParagraph({})).toBe('6_1_AB');
    expect(incomeParagraph({ incomeParagraph: '6_2_A' })).toBe('6_2_A');
    expect(incomeParagraph({ incomeParagraph: 'bad' })).toBe('6_1_AB');
  });
});

describe('books of receivables and payables', () => {
  const line = { id: 'l', name: 'a', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23' };
  const docs = [
    { id: 'i1', kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', number: '1', issueDate: '2026-11-01', dueDate: '2026-11-15', buyer: { name: 'A' }, lines: [line], payments: [{ id: 'p', date: '2026-12-01', amount: '23' }, { id: 'q', date: '2027-01-05', amount: '100' }] },
    { id: 'i2', kind: 'INVOICE', status: 'PAID', currency: 'EUR', number: '2', issueDate: '2026-10-01', buyer: { name: 'B' }, lines: [line], payments: [{ id: 'r', date: '2026-10-02', amount: '123' }] },
    { id: 'i3', kind: 'INVOICE', status: 'DRAFT', currency: 'EUR', issueDate: '2026-10-01', lines: [line], payments: [] },
    { id: 'i4', kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', issueDate: '2027-01-02', lines: [line], payments: [] },
    { id: 'i5', kind: 'INVOICE', status: 'ISSUED', currency: 'CZK', fxRate: '25', issueDate: '2026-12-01', lines: [{ ...line, unitPrice: '2500', vatCategory: 'O', vatRate: null }], payments: [] },
    { id: 'r1', kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS', currency: 'EUR', receivedDate: '2026-12-30', issueDate: '2026-12-20', seller: { name: 'S' }, lines: [line], payments: [] }
  ];

  it('lists receivables open at the day with the paid part', () => {
    const book = receivablesBook(docs, '2026-12-31');
    expect(book.rows.map(r => [r.docId, r.paid, r.outstanding, r.outstandingEur, r.overdueDays])).toEqual([['i1', '23.00', '100.00', '100.00', 46], ['i5', '0.00', '2500.00', '100.00', 0]]);
    expect(book.total).toBe('200.00');
    expect(receivablesBook(docs, '2027-01-10').rows.map(r => r.docId)).toEqual(['i5', 'i4']);
  });

  it('lists payables by the received date', () => {
    expect(payablesBook(docs, '2026-12-31')).toMatchObject({ total: '123.00', rows: [{ docId: 'r1', party: 'S' }] });
    expect(payablesBook(docs, '2026-12-29').rows).toEqual([]);
  });
});

describe('travel compensation', () => {
  it('picks the meal band by hours and date', () => {
    expect(mealAllowance(4.9, '2026-05-01')).toBe('0.00');
    expect(mealAllowance(5, '2026-05-01')).toBe('9.30');
    expect(mealAllowance(12, '2026-05-01')).toBe('13.80');
    expect(mealAllowance(18, '2026-05-01')).toBe('20.60');
    expect(mealAllowance(5, '2025-11-30')).toBe('8.80');
    expect(mealAllowance(5, '2025-12-01')).toBe('9.30');
  });

  it('pays the km rate valid on the trip day', () => {
    expect(tripAllowance({ date: '2025-12-31', km: '100' }).kmAmount).toBe('29.60');
    expect(tripAllowance({ date: '2026-01-01', km: '100' }).kmAmount).toBe('31.30');
    expect(tripAllowance({ date: '2026-01-01', km: '100', fuelCost: '12.5', hours: 6 })).toMatchObject({ fuel: '12.50', meal: '9.30', total: '53.10' });
  });

  it('pays no km rate for a business car', () => {
    expect(tripAllowance({ date: '2026-01-01', km: '100', fuelCost: '12', assetId: 'car' })).toMatchObject({ kmRate: null, total: '0.00' });
  });

  it('uses a stored allowance and books the rows of a year', () => {
    const trips = [
      { id: 't1', date: '2026-02-01', km: '10', from: 'BA', to: 'TT', allowance: '5' },
      { id: 't2', date: '2026-03-01', km: '100' },
      { id: 't3', date: '2025-12-01', km: '100' },
      { id: 't4', date: '2026-03-01', km: '100', assetId: 'car' }
    ];
    expect(tripAmount(trips[0])).toBe('5.00');
    expect(tripRows(trips, 2026).map(r => [r.id, r.amount, r.text])).toEqual([['trip:t1', '5.00', 'BA - TT'], ['trip:t2', '31.30', null]]);
    expect(tripSummary(trips, 2026)).toEqual({ count: 3, km: '210.0', amount: '36.30' });
  });

  it('reports a date without rates', () => {
    expect(() => tripAllowance({ date: '2024-01-01', km: '1' })).toThrow(expect.objectContaining({ code: 'LEGISLATION_NOT_IN_FORCE' }));
  });
});
