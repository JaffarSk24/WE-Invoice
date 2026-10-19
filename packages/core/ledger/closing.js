// Uzávierka roka of jednoduché účtovníctvo (05-accounting-tax.md § 5.4.2):
// one pure pass over the year that builds the peňažný denník with the
// non-cash rows (tax depreciation, travel), both statements, the books of
// receivables and payables, and a checklist of what still blocks a clean
// close: cash and bank against the counted and stated balances, expenses
// without a category, bank lines without a document, disposed assets
// whose residual value needs a decision. The closing balances carry over
// as the opening of the next year.
import { cmp, sub, round, isZero } from '../money/index.js';
import { cashJournal, openingBalances, journalSummary } from './cash-journal.js';
import { depreciationRows, depreciationPlan } from './depreciation.js';
import { tripRows } from './travel.js';
import { receivablesBook, payablesBook } from './books.js';
import { incomeExpenseStatement, assetsLiabilitiesStatement } from './statements.js';
import { planEntrySync } from './sync-plan.js';

const live = (r) => r && !r.deleted;

// A counted or stated balance: ok when not given yet is false (to do),
// otherwise equal to the books.
function reconcile(id, books, stated) {
  if (stated === null || stated === undefined || stated === '') return { id, ok: false, pending: true, books, stated: null, difference: null };
  const difference = round(sub(stated, books), 2);
  return { id, ok: isZero(difference), pending: false, books, stated: round(stated, 2), difference };
}

/**
 * Everything the closing wizard shows for a year.
 * @param {{year: number, entries: object[], documents?: object[], assets?: object[], trips?: object[],
 *   bankTransactions?: object[], company?: object, initial?: {cash?: string, bank?: string},
 *   inputs?: {cashCount?: string, bankStatement?: string, inventory?: string, stamps?: string, otherAssets?: string, loans?: string, otherLiabilities?: string}}} input
 */
export function yearClosing(input) {
  const { year, entries = [], documents = [], assets = [], trips = [], bankTransactions = [], company = null, initial = {}, inputs = {} } = input;
  const y = Number(year);
  const opening = openingBalances(entries, y, initial);
  const extraRows = [...depreciationRows(assets, y), ...tripRows(trips, y)];
  const journal = cashJournal(entries, y, { opening, extraRows });
  const end = `${y}-12-31`;
  const receivables = receivablesBook(documents, end);
  const payables = payablesBook(documents, end);
  const incomeExpense = incomeExpenseStatement(journal);
  const assetsLiabilities = assetsLiabilitiesStatement({
    year: y, assets, closing: journal.closing, receivables: receivables.total, payables: payables.total, inputs
  });
  const sync = planEntrySync({ documents, entries, company, bankTransactions: bankTransactions.filter(t => String(t.date).startsWith(`${y}-`)) });
  const pendingAuto = sync.insert.filter(e => String(e.date).startsWith(`${y}-`)).length + sync.update.length + sync.remove.length;
  const disposals = assets.filter(live).filter(a => a.disposedOn && a.disposedOn.startsWith(`${y}-`))
    .map(a => ({ assetId: a.id, name: a.name, residual: depreciationPlan(a).disposal?.residual ?? '0.00' }));
  const count = (code) => journal.warnings.filter(w => w.code === code).length + sync.warnings.filter(w => w.code === code).length;
  const checklist = [
    reconcile('cash', journal.closing.cash, inputs.cashCount),
    reconcile('bank', journal.closing.bank, inputs.bankStatement),
    { id: 'uncategorized', ok: count('EXPENSE_UNCATEGORIZED') === 0, count: count('EXPENSE_UNCATEGORIZED') },
    { id: 'withoutDocument', ok: count('PAYMENT_WITHOUT_DOCUMENT') === 0, count: count('PAYMENT_WITHOUT_DOCUMENT') },
    { id: 'cashNegative', ok: count('CASH_NEGATIVE') === 0, count: count('CASH_NEGATIVE') },
    { id: 'autoEntries', ok: pendingAuto === 0, count: pendingAuto },
    { id: 'disposals', ok: disposals.length === 0, count: disposals.length },
    { id: 'inventory', ok: inputs.inventory !== undefined && inputs.inventory !== null && inputs.inventory !== '', pending: true }
  ];
  return {
    year: y,
    journal,
    summary: journalSummary(journal.totals),
    receivables,
    payables,
    incomeExpense,
    assetsLiabilities,
    disposals,
    checklist,
    ready: checklist.every(c => c.ok),
    carryForward: { year: y + 1, cash: journal.closing.cash, bank: journal.closing.bank },
    negativeResult: cmp(incomeExpense.result, '0') < 0
  };
}
