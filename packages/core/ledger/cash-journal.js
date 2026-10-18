// Peňažný denník of a year: every money movement in date order, spread
// over the columns of the journal (money by cash and bank, transfers as
// priebežné položky, income and expense by kind, VAT apart), with column
// totals, month totals and the closing balances of cash and bank. Rows
// that move no money (tax depreciation, travel allowances of the owner)
// come in as `extraRows` and fill only their category column.
import { add, sub, sum, cmp, round, isZero, neg } from '../money/index.js';
import { CoreError } from '../errors.js';
import { JOURNAL_COLUMNS, categoryDirection } from './categories.js';

const live = (r) => r && !r.deleted;
const other = (medium) => (medium === 'CASH' ? 'BANK' : 'CASH');
const col = (medium, side) => `${medium === 'CASH' ? 'cash' : 'bank'}${side}`;

/** Column amounts of one entry. @returns {Object<string, string>} */
export function entryColumns(entry) {
  const cols = {};
  const put = (name, value) => { if (value !== null && value !== undefined && !isZero(value)) cols[name] = round(add(cols[name] || '0', value), 2); };
  const amount = round(entry.amount, 2);
  if (entry.direction === 'TRANSFER') {
    put(col(entry.medium, 'Out'), amount);
    put(col(other(entry.medium), 'In'), amount);
    put('transferIn', amount);
    put('transferOut', amount);
    return cols;
  }
  if (categoryDirection(entry.category) !== entry.direction) {
    throw new CoreError('LEDGER_CATEGORY_INVALID', `${entry.category} does not fit ${entry.direction}`, { entryId: entry.id });
  }
  const vat = entry.vat ? round(entry.vat, 2) : null;
  const net = vat ? sub(amount, vat) : amount;
  if (entry.medium) {
    const moves = entry.direction === 'INCOME' ? amount : neg(amount);
    if (cmp(moves, '0') >= 0) put(col(entry.medium, 'In'), moves); else put(col(entry.medium, 'Out'), neg(moves));
  }
  put(entry.category, net);
  if (vat) put(entry.direction === 'INCOME' ? 'vatIn' : 'vatOut', vat);
  return cols;
}

function totalsOf(rows) {
  const totals = {};
  for (const name of JOURNAL_COLUMNS) totals[name] = round(sum(rows.map(r => r.cols[name] || '0')), 2);
  return totals;
}

const byDate = (a, b) => a.date.localeCompare(b.date) || String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }) || String(a.id || '').localeCompare(String(b.id || ''));

/** Cash and bank balance after the given entries on top of an opening state. */
export function balancesAfter(entries, opening = {}) {
  let cash = opening.cash || '0';
  let bank = opening.bank || '0';
  for (const entry of entries.filter(live)) {
    const c = entryColumns(entry);
    cash = add(cash, sub(c.cashIn || '0', c.cashOut || '0'));
    bank = add(bank, sub(c.bankIn || '0', c.bankOut || '0'));
  }
  return { cash: round(cash, 2), bank: round(bank, 2) };
}

/** Opening balances of a year: the initial state plus everything booked before it. */
export function openingBalances(entries, year, initial = {}) {
  const before = (entries || []).filter(e => live(e) && e.date < `${year}-01-01`);
  return balancesAfter(before, initial);
}

/**
 * Peňažný denník of a year with column totals.
 * @param {object[]} entries  ledger entries (tombstones are skipped)
 * @param {number|string} year
 * @param {{opening?: {cash?: string, bank?: string}, extraRows?: object[]}} [options]
 *   extraRows: { date, number?, text?, category, amount } booked without money
 * @returns {{year: number, rows: object[], totals: object, months: object[], opening: object, closing: object, warnings: object[]}}
 */
export function cashJournal(entries, year, options = {}) {
  const y = Number(year);
  if (!Number.isInteger(y) || y < 1900 || y > 9999) throw new CoreError('LEDGER_YEAR_INVALID', `invalid year ${year}`);
  const prefix = `${y}-`;
  const opening = { cash: round(options.opening?.cash || '0', 2), bank: round(options.opening?.bank || '0', 2) };
  const own = (entries || []).filter(e => live(e) && String(e.date).startsWith(prefix));
  const extra = (options.extraRows || []).filter(r => String(r.date).startsWith(prefix))
    .map(r => ({ ...r, direction: categoryDirection(r.category), medium: null, vat: null, virtual: true }));
  const warnings = [];
  let cash = opening.cash;
  const rows = [...own, ...extra].sort(byDate).map(entry => {
    const cols = entryColumns(entry);
    const wasNegative = cmp(cash, '0') < 0;
    cash = add(cash, sub(cols.cashIn || '0', cols.cashOut || '0'));
    // Cash cannot go below zero: warn where it first does.
    if (cmp(cash, '0') < 0 && !wasNegative) warnings.push({ code: 'CASH_NEGATIVE', date: entry.date, entryId: entry.id || null });
    if (entry.category === 'EXPENSE_UNCATEGORIZED') warnings.push({ code: 'EXPENSE_UNCATEGORIZED', date: entry.date, entryId: entry.id || null, docId: entry.docId || null });
    return {
      id: entry.id || null, date: entry.date, number: entry.number || null, text: entry.text || null,
      direction: entry.direction, category: entry.category, docId: entry.docId || null,
      auto: Boolean(entry.auto), virtual: Boolean(entry.virtual), cols
    };
  });
  const totals = totalsOf(rows);
  const months = Array.from({ length: 12 }, (_, i) => {
    const m = `${prefix}${String(i + 1).padStart(2, '0')}`;
    return { month: m, totals: totalsOf(rows.filter(r => r.date.startsWith(m))) };
  });
  const closing = {
    cash: round(add(opening.cash, sub(totals.cashIn, totals.cashOut)), 2),
    bank: round(add(opening.bank, sub(totals.bankIn, totals.bankOut)), 2)
  };
  return { year: y, rows, totals, months, opening, closing, warnings };
}

/** Sums of the journal that the statements and the tax base use. */
export function journalSummary(totals) {
  const pick = (names) => round(sum(names.map(n => totals[n] || '0')), 2);
  const taxIncome = pick(['INCOME_TAX_GOODS', 'INCOME_TAX_SERVICES', 'INCOME_TAX_OTHER']);
  const taxExpense = pick(['EXPENSE_TAX_MATERIAL', 'EXPENSE_TAX_GOODS', 'EXPENSE_TAX_SERVICES', 'EXPENSE_TAX_WAGES',
    'EXPENSE_TAX_INSURANCE', 'EXPENSE_TAX_OVERHEAD', 'EXPENSE_TAX_OTHER']);
  return {
    taxIncome,
    taxExpense,
    nonTaxIncome: pick(['INCOME_NONTAX']),
    nonTaxExpense: pick(['EXPENSE_NONTAX']),
    uncategorized: pick(['EXPENSE_UNCATEGORIZED']),
    result: round(sub(taxIncome, taxExpense), 2)
  };
}
