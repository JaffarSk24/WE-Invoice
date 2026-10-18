// Expense categories of received documents, kept as data
// (expense-categories.json): the peňažný denník column, whether the
// expense is tax deductible and whether its input VAT may be deducted.
// The category of a document is the accounting category of its lines.
import data from './expense-categories.json' with { type: 'json' };

export const EXPENSE_CATEGORIES = Object.freeze(data.categories.map(c => Object.freeze({ ...c })));
export const JOURNAL_COLUMNS = Object.freeze([...data.journalColumns]);

/** The category with an id, or null. */
export function expenseCategory(id) {
  return EXPENSE_CATEGORIES.find(c => c.id === id) || null;
}

/** The category of a document: the one shared by its item lines, else null. */
export function documentCategory(doc) {
  const ids = [...new Set((doc.lines || []).filter(l => !l.kind || l.kind === 'ITEM').map(l => l.accountingCategory || null))];
  return ids.length === 1 ? ids[0] : null;
}

/** The document with every item line in one category. */
export function withCategory(doc, id) {
  return { ...doc, lines: (doc.lines || []).map(l => (!l.kind || l.kind === 'ITEM' ? { ...l, accountingCategory: id } : l)) };
}
