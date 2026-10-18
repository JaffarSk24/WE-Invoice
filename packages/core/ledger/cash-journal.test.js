import { describe, it, expect } from 'vitest';
import { cashJournal, entryColumns, openingBalances, journalSummary, balancesAfter } from './cash-journal.js';
import { toCsv } from './csv.js';

const e = (over) => ({ id: over.id || 'e', date: '2026-01-15', direction: 'INCOME', medium: 'BANK', amount: '100', vat: null, category: 'INCOME_TAX_SERVICES', ...over });

describe('entryColumns', () => {
  it('puts an income on the money and category columns', () => {
    expect(entryColumns(e({}))).toEqual({ bankIn: '100.00', INCOME_TAX_SERVICES: '100.00' });
  });

  it('separates VAT for a payer', () => {
    expect(entryColumns(e({ amount: '123', vat: '23' }))).toEqual({ bankIn: '123.00', INCOME_TAX_SERVICES: '100.00', vatIn: '23.00' });
    expect(entryColumns(e({ direction: 'EXPENSE', medium: 'CASH', category: 'EXPENSE_TAX_GOODS', amount: '123', vat: '23' })))
      .toEqual({ cashOut: '123.00', EXPENSE_TAX_GOODS: '100.00', vatOut: '23.00' });
  });

  it('turns a negative income into money out', () => {
    expect(entryColumns(e({ amount: '-50' }))).toEqual({ bankOut: '50.00', INCOME_TAX_SERVICES: '-50.00' });
  });

  it('books a transfer from cash to bank as priebežné položky', () => {
    expect(entryColumns(e({ direction: 'TRANSFER', medium: 'CASH', category: 'TRANSFER', amount: '500' })))
      .toEqual({ cashOut: '500.00', bankIn: '500.00', transferIn: '500.00', transferOut: '500.00' });
  });

  it('refuses a category of the other direction', () => {
    expect(() => entryColumns(e({ category: 'EXPENSE_TAX_GOODS' }))).toThrow(expect.objectContaining({ code: 'LEDGER_CATEGORY_INVALID' }));
  });
});

describe('cashJournal', () => {
  const entries = [
    e({ id: 'a', date: '2026-02-01', number: '2', amount: '200' }),
    e({ id: 'b', date: '2026-01-10', number: '1', medium: 'CASH', amount: '50' }),
    e({ id: 'c', date: '2026-02-01', number: '1', direction: 'EXPENSE', medium: 'CASH', category: 'EXPENSE_TAX_SERVICES', amount: '80' }),
    e({ id: 'old', date: '2025-12-31', amount: '1000' }),
    e({ id: 'gone', date: '2026-03-01', amount: '999', deleted: true })
  ];

  it('lists the year in date and number order', () => {
    const j = cashJournal(entries, 2026);
    expect(j.rows.map(r => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('sums the columns and the closing balances', () => {
    const j = cashJournal(entries, 2026, { opening: { cash: '10', bank: '1000' } });
    expect(j.totals.cashIn).toBe('50.00');
    expect(j.totals.cashOut).toBe('80.00');
    expect(j.totals.bankIn).toBe('200.00');
    expect(j.totals.INCOME_TAX_SERVICES).toBe('250.00');
    expect(j.closing).toEqual({ cash: '-20.00', bank: '1200.00' });
    expect(j.months[0].totals.cashIn).toBe('50.00');
    expect(j.months[1].totals.bankIn).toBe('200.00');
    expect(j.warnings).toEqual([{ code: 'CASH_NEGATIVE', date: '2026-02-01', entryId: 'c' }]);
  });

  it('adds rows that move no money', () => {
    const j = cashJournal([], 2026, { extraRows: [{ id: 'dep', date: '2026-12-31', category: 'EXPENSE_TAX_OTHER', amount: '500' }, { date: '2025-12-31', category: 'EXPENSE_TAX_OTHER', amount: '1' }] });
    expect(j.rows).toHaveLength(1);
    expect(j.rows[0]).toMatchObject({ virtual: true, cols: { EXPENSE_TAX_OTHER: '500.00' } });
    expect(j.closing).toEqual({ cash: '0.00', bank: '0.00' });
  });

  it('carries balances from earlier years', () => {
    expect(openingBalances(entries, 2026, { bank: '5' })).toEqual({ cash: '0.00', bank: '1005.00' });
    expect(balancesAfter([], {})).toEqual({ cash: '0.00', bank: '0.00' });
  });

  it('summarises the tax result', () => {
    const s = journalSummary(cashJournal(entries, 2026).totals);
    expect(s).toEqual({ taxIncome: '250.00', taxExpense: '80.00', nonTaxIncome: '0.00', nonTaxExpense: '0.00', uncategorized: '0.00', result: '170.00' });
  });

  it('refuses a bad year', () => {
    expect(() => cashJournal([], 'abc')).toThrow(expect.objectContaining({ code: 'LEDGER_YEAR_INVALID' }));
  });
});

describe('ledger CSV', () => {
  it('uses semicolons, decimal commas and quotes', () => {
    expect(toCsv(['a', 'b'], [['1.50', 'x;y'], [null, 'q"']])).toBe('\uFEFFa;b\r\n1,50;"x;y"\r\n;"q"""\r\n');
    expect(toCsv(['a'], [['1.5']], { decimalComma: false, bom: false })).toBe('a\r\n1.5\r\n');
  });
});
