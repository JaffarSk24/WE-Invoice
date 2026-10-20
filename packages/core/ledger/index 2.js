// Bookkeeping for sole traders (WP-LEDGER, 05-accounting-tax.md § 5.4):
// daňová evidencia with flat-rate expenses and jednoduché účtovníctvo
// (peňažný denník, books of receivables and payables, assets and their
// depreciation, travel compensation, year-end statements). Pure functions
// only; the screens live in app/src/views/ledger.
export {
  LEDGER_CATEGORIES, INCOME_CATEGORIES, EXPENSE_CATEGORIES, TRANSFER_CATEGORIES, JOURNAL_COLUMNS,
  INCOME_PARAGRAPHS, DEFAULT_INCOME_PARAGRAPH, categoryDirection, categoryFits, isTaxCategory, lineCategory
} from './categories.js';
export { entriesForPayment, paymentDirection as ledgerPaymentDirection, entryId as ledgerEntryId } from './payment-entries.js';
export { planEntrySync } from './sync-plan.js';
export { cashJournal, entryColumns, balancesAfter, openingBalances, journalSummary } from './cash-journal.js';
export { depreciationPlan, depreciationRule, depreciationInYear, depreciationRows, accountingPlan, isLowValue } from './depreciation.js';
export { flatExpenses, flatSummary, incomeRecords, activityMonths, incomeParagraph } from './flat.js';
export { receivablesBook, payablesBook } from './books.js';
export { mealAllowance, tripAllowance, tripAmount, tripRows, tripSummary } from './travel.js';
export { incomeExpenseStatement, assetsLiabilitiesStatement, residualAt } from './statements.js';
export { yearClosing } from './closing.js';
export { toCsv as ledgerCsv } from './csv.js';
