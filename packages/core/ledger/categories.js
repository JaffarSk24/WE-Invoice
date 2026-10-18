// Columns of the peňažný denník (jednoduché účtovníctvo, opatrenie MF SR
// č. 23054/2002-92) and the categories a ledger entry may carry. A
// category is the column an amount lands in; the column decides whether
// the amount is a tax income, a tax expense, a non-tax item or a transfer
// (priebežná položka). The list is structure, not a rate, so it lives in
// code; the income paragraphs of DPFO typ B are the § 6 ZDP groups.
import { CoreError } from '../errors.js';

export const INCOME_CATEGORIES = Object.freeze([
  'INCOME_TAX_GOODS', // príjmy daňové: tovar
  'INCOME_TAX_SERVICES', // príjmy daňové: výrobky a služby
  'INCOME_TAX_OTHER', // príjmy daňové: ostatné
  'INCOME_NONTAX' // príjmy nedaňové (vklad, úver, ...)
]);

export const EXPENSE_CATEGORIES = Object.freeze([
  'EXPENSE_TAX_MATERIAL',
  'EXPENSE_TAX_GOODS',
  'EXPENSE_TAX_SERVICES',
  'EXPENSE_TAX_WAGES',
  'EXPENSE_TAX_INSURANCE', // poistné (sociálne a zdravotné) podnikateľa a zamestnancov
  'EXPENSE_TAX_OVERHEAD', // prevádzková réžia
  'EXPENSE_TAX_OTHER',
  'EXPENSE_NONTAX', // výdavky nedaňové (osobná spotreba, splátka istiny, ...)
  'EXPENSE_UNCATEGORIZED' // still to classify: left out of the statements
]);

export const TRANSFER_CATEGORIES = Object.freeze(['TRANSFER']);

export const LEDGER_CATEGORIES = Object.freeze([...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, ...TRANSFER_CATEGORIES]);

// Columns of the journal, in print order. Each amount column takes the
// categories listed; VAT and money columns are filled by the journal.
export const JOURNAL_COLUMNS = Object.freeze([
  'cashIn', 'cashOut', 'bankIn', 'bankOut', 'transferIn', 'transferOut',
  ...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, 'vatIn', 'vatOut'
]);

// Income paragraphs of § 6 ZDP that the tax records keep apart.
export const INCOME_PARAGRAPHS = Object.freeze(['6_1_AB', '6_1_C', '6_2_A', '6_2_BD', '6_4']);
export const DEFAULT_INCOME_PARAGRAPH = '6_1_AB';

// Default category of a document line without its own accountingCategory.
const ISSUED_DEFAULT = 'INCOME_TAX_SERVICES';
const RECEIVED_DEFAULT = 'EXPENSE_UNCATEGORIZED';

/** INCOME, EXPENSE or TRANSFER for a category; throws LEDGER_CATEGORY_INVALID. */
export function categoryDirection(category) {
  if (INCOME_CATEGORIES.includes(category)) return 'INCOME';
  if (EXPENSE_CATEGORIES.includes(category)) return 'EXPENSE';
  if (TRANSFER_CATEGORIES.includes(category)) return 'TRANSFER';
  throw new CoreError('LEDGER_CATEGORY_INVALID', `unknown ledger category ${category}`);
}

/** True when the amount counts for the income tax base. */
export function isTaxCategory(category) {
  return /^(INCOME|EXPENSE)_TAX_/.test(category);
}

/** Whether a category may be used with a direction (an entry is checked on save). */
export function categoryFits(category, direction) {
  try { return categoryDirection(category) === direction; } catch { return false; }
}

/** The category of a line: its own when it fits the direction, else the default. */
export function lineCategory(line, direction) {
  const own = line?.accountingCategory;
  if (own && categoryFits(own, direction)) return own;
  return direction === 'INCOME' ? ISSUED_DEFAULT : RECEIVED_DEFAULT;
}
