import { describe, it, expect } from 'vitest';
import { yearClosing } from './closing.js';
import { incomeExpenseStatement, assetsLiabilitiesStatement } from './statements.js';
import { cashJournal } from './cash-journal.js';
import * as core from '../index.js';

describe('statements', () => {
  it('reads the income and expense rows from the journal', () => {
    const j = cashJournal([{ id: 'a', date: '2026-01-01', direction: 'EXPENSE', medium: 'BANK', amount: '10', category: 'EXPENSE_TAX_WAGES' }], 2026);
    const s = incomeExpenseStatement(j);
    expect(s.rows.map(r => r.code)).toEqual(['r01', 'r02', 'r03', 'r04', 'r05', 'r06', 'r07', 'r08', 'r09', 'r10', 'r11', 'r12', 'r13']);
    expect(s).toMatchObject({ income: '0.00', expense: '10.00', result: '-10.00' });
  });

  it('builds the assets and liabilities statement', () => {
    const s = assetsLiabilitiesStatement({ year: 2026, closing: { cash: '-1', bank: '11' }, receivables: '5', payables: '3', inputs: { loans: '100', stamps: '2' } });
    expect(s).toMatchObject({ assets: '17.00', liabilities: '103.00', difference: '-86.00', negativeCash: true });
  });
});

describe('yearClosing', () => {
  it('leaves the reconciliations pending until counted', () => {
    const r = yearClosing({ year: 2026, entries: [] });
    expect(r.checklist.find(c => c.id === 'cash')).toMatchObject({ ok: false, pending: true });
    expect(r.ready).toBe(false);
    expect(r.negativeResult).toBe(false);
  });

  it('shows the difference of a counted balance', () => {
    const r = yearClosing({ year: 2026, entries: [], initial: { cash: '10' }, inputs: { cashCount: '9.50' } });
    expect(r.checklist.find(c => c.id === 'cash')).toMatchObject({ ok: false, pending: false, books: '10.00', stated: '9.50', difference: '-0.50' });
  });

  it('counts automatic entries not written yet', () => {
    const documents = [{ id: 'd', kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', lines: [{ id: 'l', name: 'a', qty: '1', unitPrice: '5', vatCategory: 'O' }], payments: [{ id: 'p', date: '2026-01-02', amount: '5', method: 'CASH' }] }];
    const r = yearClosing({ year: 2026, entries: [], documents, company: { vatMode: 'NONPAYER' } });
    expect(r.checklist.find(c => c.id === 'autoEntries')).toMatchObject({ ok: false, count: 1 });
  });
});

describe('core API of the ledger', () => {
  it.each([
    'planEntrySync', 'cashJournal', 'entryColumns', 'openingBalances', 'journalSummary', 'depreciationPlan', 'depreciationRows', 'accountingPlan',
    'isLowValue', 'flatExpenses', 'flatSummary', 'incomeRecords', 'receivablesBook', 'payablesBook', 'tripAllowance', 'tripRows', 'tripSummary',
    'incomeExpenseStatement', 'assetsLiabilitiesStatement', 'residualAt', 'yearClosing', 'ledgerCsv', 'categoryDirection', 'ledgerEntryId'
  ])('exports %s', (name) => {
    expect(typeof core[name]).toBe('function');
  });

  it('exports the category lists', () => {
    expect(core.LEDGER_CATEGORIES).toContain('EXPENSE_TAX_INSURANCE');
    expect(core.JOURNAL_COLUMNS[0]).toBe('cashIn');
  });
});
