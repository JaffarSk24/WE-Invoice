// Expense categories of received documents, kept as data
// (expense-categories.json). The user picks a purchase category (fuel,
// rent, software...); the document keeps it as expenseCategory and its
// item lines carry the matching peňažný denník category of the ledger
// package as accountingCategory, so the cash journal books them without
// knowing the purchase list.
import data from './expense-categories.json' with { type: 'json' };
import { EXPENSE_CATEGORIES as LEDGER_EXPENSE_CATEGORIES } from '../../ledger/categories.js';

export const PURCHASE_CATEGORIES = Object.freeze(data.categories.map(c => Object.freeze({ ...c })));

/** The category with an id, or null. */
export function expenseCategory(id) {
  return PURCHASE_CATEGORIES.find(c => c.id === id) || null;
}

const itemLines = (doc) => (doc.lines || []).filter(l => !l.kind || l.kind === 'ITEM');

/**
 * The purchase category of a document: its own, else the first one whose
 * ledger category its lines carry, else null.
 */
export function documentCategory(doc) {
  if (doc.expenseCategory && expenseCategory(doc.expenseCategory)) return doc.expenseCategory;
  const ledger = [...new Set(itemLines(doc).map(l => l.accountingCategory || null))];
  if (ledger.length !== 1 || !ledger[0]) return null;
  const match = PURCHASE_CATEGORIES.find(c => c.ledgerCategory === ledger[0]);
  return match ? match.id : null;
}

/** The document in a purchase category (null clears it). */
export function withCategory(doc, id) {
  const category = id ? expenseCategory(id) : null;
  const ledger = category ? category.ledgerCategory : null;
  return {
    ...doc,
    expenseCategory: category ? category.id : null,
    lines: (doc.lines || []).map(l => (!l.kind || l.kind === 'ITEM' ? { ...l, accountingCategory: ledger } : l))
  };
}

/** Whether every ledger category named in the data exists in the ledger package. */
export function categoriesMatchLedger() {
  return PURCHASE_CATEGORIES.every(c => LEDGER_EXPENSE_CATEGORIES.includes(c.ledgerCategory));
}
