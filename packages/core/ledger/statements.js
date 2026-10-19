// The two year-end statements of jednoduché účtovníctvo (opatrenie MF SR
// č. 23054/2002-92): Výkaz o príjmoch a výdavkoch, read from the totals of
// the peňažný denník, and Výkaz o majetku a záväzkoch, from the cash and
// bank balances, the books of receivables and payables, the residual
// values of the assets and the amounts the user enters at the closing
// (inventory, stamps, loans, other). Each row has a stable code and the
// keys of the journal it sums, so print and CSV share one source.
import { add, sub, round, sum, cmp } from '../money/index.js';
import { depreciationPlan } from './depreciation.js';

const INCOME_ROWS = [
  ['r01', ['INCOME_TAX_GOODS']],
  ['r02', ['INCOME_TAX_SERVICES']],
  ['r03', ['INCOME_TAX_OTHER']]
];
const EXPENSE_ROWS = [
  ['r05', ['EXPENSE_TAX_MATERIAL']],
  ['r06', ['EXPENSE_TAX_GOODS']],
  ['r07', ['EXPENSE_TAX_SERVICES']],
  ['r08', ['EXPENSE_TAX_WAGES']],
  ['r09', ['EXPENSE_TAX_INSURANCE']],
  ['r10', ['EXPENSE_TAX_OVERHEAD']],
  ['r11', ['EXPENSE_TAX_OTHER']]
];

const pick = (totals, keys) => round(sum(keys.map(k => totals[k] || '0')), 2);
const live = (r) => r && !r.deleted;

/**
 * Výkaz o príjmoch a výdavkoch from the totals of a cash journal.
 * @param {{year: number, totals: object}} journal  result of cashJournal
 * @returns {{year: number, rows: {code: string, amount: string}[], income: string, expense: string, result: string, nonTaxIncome: string, nonTaxExpense: string}}
 */
export function incomeExpenseStatement(journal) {
  const { totals } = journal;
  const income = INCOME_ROWS.map(([code, keys]) => ({ code, amount: pick(totals, keys) }));
  const expense = EXPENSE_ROWS.map(([code, keys]) => ({ code, amount: pick(totals, keys) }));
  const incomeTotal = round(sum(income.map(r => r.amount)), 2);
  const expenseTotal = round(sum(expense.map(r => r.amount)), 2);
  const result = round(sub(incomeTotal, expenseTotal), 2);
  const rows = [...income, { code: 'r04', amount: incomeTotal, total: true }, ...expense, { code: 'r12', amount: expenseTotal, total: true }, { code: 'r13', amount: result, total: true }];
  return {
    year: journal.year, rows, income: incomeTotal, expense: expenseTotal, result,
    nonTaxIncome: pick(totals, ['INCOME_NONTAX']), nonTaxExpense: pick(totals, ['EXPENSE_NONTAX'])
  };
}

/** Tax residual value of an asset at the end of a year ("0.00" when low-value or disposed). */
export function residualAt(asset, year, ctx = {}) {
  const start = asset.inUseFrom || asset.acquiredOn;
  if (Number(start.slice(0, 4)) > Number(year)) return '0.00';
  if (asset.disposedOn && Number(asset.disposedOn.slice(0, 4)) <= Number(year)) return '0.00';
  const { lowValue, plan } = depreciationPlan(asset, ctx);
  if (lowValue) return '0.00';
  const done = plan.filter(p => p.year <= Number(year));
  return done.length ? done[done.length - 1].residual : round(asset.cost, 2);
}

/**
 * Výkaz o majetku a záväzkoch at 31 December.
 * @param {{year: number, assets: object[], closing: {cash: string, bank: string}, receivables: string, payables: string,
 *   inputs?: {inventory?: string, stamps?: string, otherAssets?: string, loans?: string, otherLiabilities?: string}}} input
 */
export function assetsLiabilitiesStatement({ year, assets = [], closing, receivables, payables, inputs = {} }) {
  const own = assets.filter(live);
  const residual = (kind) => round(sum(own.filter(a => a.kind === kind).map(a => residualAt(a, year))), 2);
  const value = (v) => round(v || '0', 2);
  const assetRows = [
    { code: 'm01', amount: residual('INTANGIBLE') },
    { code: 'm02', amount: residual('TANGIBLE') },
    { code: 'm03', amount: value(inputs.inventory) },
    { code: 'm04', amount: value(receivables) },
    { code: 'm05', amount: round(add(closing.cash, closing.bank), 2) },
    { code: 'm06', amount: value(inputs.stamps) },
    { code: 'm07', amount: value(inputs.otherAssets) }
  ];
  const liabilityRows = [
    { code: 'z01', amount: value(payables) },
    { code: 'z02', amount: value(inputs.loans) },
    { code: 'z03', amount: value(inputs.otherLiabilities) }
  ];
  const assetTotal = round(sum(assetRows.map(r => r.amount)), 2);
  const liabilityTotal = round(sum(liabilityRows.map(r => r.amount)), 2);
  const difference = round(sub(assetTotal, liabilityTotal), 2);
  return {
    year: Number(year),
    rows: [...assetRows, { code: 'm08', amount: assetTotal, total: true }, ...liabilityRows, { code: 'z04', amount: liabilityTotal, total: true }, { code: 'd01', amount: difference, total: true }],
    assets: assetTotal, liabilities: liabilityTotal, difference, negativeCash: cmp(closing.cash, '0') < 0
  };
}
