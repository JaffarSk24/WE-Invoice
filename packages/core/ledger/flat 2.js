// Daňová evidencia of a sole trader with flat-rate expenses (§ 6 ods. 10
// and 11 ZDP): income in date order, the flat expenses (percentage and cap
// from legislation.flatExpenses), the insurance paid in the year, which
// counts on top of the flat expenses, and the summary for DPFO typ B,
// table 1 (income and expenses by § 6 paragraph). Income of § 6 ods. 4
// has its own cap. Whether the cap is cut by months of activity is a
// legislation switch (prorateByMonths), off under the current law.
import { add, sub, mul, div, round, cmp, sum } from '../money/index.js';
import { getLegislation } from '../legislation/index.js';
import { CoreError } from '../errors.js';
import { INCOME_PARAGRAPHS, DEFAULT_INCOME_PARAGRAPH, isTaxCategory } from './categories.js';
import { allocate } from './payment-entries.js';

const live = (r) => r && !r.deleted;

/** Started calendar months of activity in a year, from the start and end dates. */
export function activityMonths(year, startDate = null, endDate = null) {
  const y = Number(year);
  const from = startDate && startDate > `${y}-01-01` ? startDate : `${y}-01-01`;
  const to = endDate && endDate < `${y}-12-31` ? endDate : `${y}-12-31`;
  if (from > to) return 0;
  return Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
}

/**
 * Flat-rate expenses for the year (§ 6 ods. 10 ZDP).
 * @param {string} income  income of the group in EUR
 * @param {{year: number|string, startDate?: string, endDate?: string, months?: number, country?: string}} ctx
 * @returns {{income: string, pct: string, cap: string, expenses: string, capped: boolean, months: number}}
 */
export function flatExpenses(income, ctx = {}) {
  const year = Number(ctx.year);
  if (!Number.isInteger(year)) throw new CoreError('LEDGER_YEAR_INVALID', `invalid year ${ctx.year}`);
  const rule = getLegislation('flatExpenses', `${year}-12-31`, ctx.country || 'SK');
  const months = ctx.months ?? activityMonths(year, ctx.startDate, ctx.endDate);
  const base = cmp(income, '0') > 0 ? round(income, 2) : '0.00';
  const cap = rule.prorateByMonths ? round(div(mul(rule.maxAnnual, String(months)), '12', 10), 2) : round(rule.maxAnnual, 2);
  const computed = round(div(mul(base, rule.pct), '100', 10), 2);
  const capped = cmp(computed, cap) > 0;
  return { income: base, pct: rule.pct, cap, expenses: capped ? cap : computed, capped, months };
}

/** Paragraph of an income entry (manual entries may set incomeParagraph). */
export function incomeParagraph(entry) {
  return INCOME_PARAGRAPHS.includes(entry.incomeParagraph) ? entry.incomeParagraph : DEFAULT_INCOME_PARAGRAPH;
}

// Income without VAT: a payer's VAT is not income.
const netOf = (entry) => round(entry.vat ? sub(entry.amount, entry.vat) : entry.amount, 2);

/** Evidencia príjmov: tax income entries of a year in date order with a running total. */
export function incomeRecords(entries, year) {
  let running = '0';
  const rows = (entries || [])
    .filter(e => live(e) && e.direction === 'INCOME' && isTaxCategory(e.category) && String(e.date).startsWith(`${year}-`))
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.number || '').localeCompare(String(b.number || ''), undefined, { numeric: true }))
    .map(e => {
      const amount = netOf(e);
      running = add(running, amount);
      return { id: e.id, date: e.date, number: e.number || null, text: e.text || null, paragraph: incomeParagraph(e), medium: e.medium, amount, running: round(running, 2) };
    });
  return { year: Number(year), rows, total: round(running, 2) };
}

/**
 * Summary for DPFO typ B, table 1, of the tax records with flat expenses.
 * @param {{entries: object[], year: number, startDate?: string, endDate?: string, country?: string}} input
 * @returns {{year: number, rows: object[], groups: object[], insurance: string, income: string, expenses: string, base: string}}
 */
export function flatSummary({ entries, year, startDate = null, endDate = null, country = 'SK' }) {
  const records = incomeRecords(entries, year);
  const byParagraph = new Map(INCOME_PARAGRAPHS.map(p => [p, '0']));
  records.rows.forEach(r => byParagraph.set(r.paragraph, add(byParagraph.get(r.paragraph), r.amount)));
  const insurance = round(sum((entries || []).filter(e => live(e) && e.category === 'EXPENSE_TAX_INSURANCE' && String(e.date).startsWith(`${year}-`)).map(netOf)), 2);
  const rule = getLegislation('flatExpenses', `${Number(year)}-12-31`, country);
  const separate = rule.separateCapParagraphs || [];
  const groupDefs = [INCOME_PARAGRAPHS.filter(p => !separate.includes(p)), ...separate.map(p => [p])];
  const rows = [];
  const groups = groupDefs.map(paragraphs => {
    const incomes = paragraphs.map(p => round(byParagraph.get(p), 2));
    const flat = flatExpenses(sum(incomes), { year, startDate, endDate, country });
    const parts = allocate(flat.expenses, incomes.map(i => (cmp(i, '0') > 0 ? i : '0')));
    paragraphs.forEach((paragraph, i) => {
      if (cmp(incomes[i], '0') !== 0) rows.push({ paragraph, income: incomes[i], expenses: parts[i] });
    });
    return { paragraphs, ...flat };
  });
  const income = round(sum(rows.map(r => r.income)), 2);
  const expenses = round(add(sum(groups.map(g => g.expenses)), insurance), 2);
  return { year: Number(year), rows, groups, insurance, income, expenses, base: round(sub(income, expenses), 2) };
}
