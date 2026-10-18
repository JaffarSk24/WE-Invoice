// Tax depreciation of fixed assets (§ 26 to § 28 ZDP) and an optional
// accounting plan. The groups, their years, the coefficients of the
// accelerated method and the low-value thresholds come from legislation
// (depreciation), taken on the day the asset is put into use.
//   Straight (§ 27): yearly amount = cost / years; the first year gets the
//   months from the month of use on, the rest goes to the year after the
//   last full one.
//   Accelerated (§ 28, groups 2 and 3 only): first year cost / k1 (pro rata
//   by months), then 2 x residual / (k2 - years already depreciated).
//   Disposal: the year of disposal gets the whole months before it; the
//   residual value is reported, never booked on its own (after a sale it
//   counts only up to the sale income, § 19 ods. 3 písm. b).
// Each yearly amount is rounded up to whole euros when legislation says so.
import { add, sub, mul, div, round, cmp, isZero } from '../money/index.js';
import { getLegislation } from '../legislation/index.js';
import { CoreError } from '../errors.js';

const month = (date) => Number(date.slice(5, 7));
const yearOf = (date) => Number(date.slice(0, 4));
const min = (a, b) => (cmp(a, b) <= 0 ? a : b);

function roundYear(value, rule) {
  if (!rule.roundUpToWholeEuro) return round(value, 2);
  let whole = round(value, 0);
  if (cmp(whole, value) < 0) whole = add(whole, '1');
  return round(whole, 2);
}

/** Depreciation rule and the group of an asset, valid on its start date. */
export function depreciationRule(asset, country = 'SK') {
  const start = asset.inUseFrom || asset.acquiredOn;
  const rule = getLegislation('depreciation', start, country);
  const group = rule.groups.find(g => g.g === Number(asset.depreciationGroup));
  if (!group) throw new CoreError('LEDGER_DEPRECIATION_GROUP_INVALID', `no depreciation group ${asset.depreciationGroup}`);
  return { rule, group, start };
}

/** True when the cost is below the threshold: an expense when paid, no plan. */
export function isLowValue(asset, country = 'SK') {
  const { rule } = depreciationRule(asset, country);
  const threshold = asset.kind === 'INTANGIBLE' ? rule.intangibleThreshold : rule.tangibleThreshold;
  return cmp(asset.cost, threshold) <= 0;
}

/**
 * Tax depreciation plan (§ 27, 28 ZDP).
 * @param {object} asset  Asset record (cost, depreciationGroup, method, acquiredOn, inUseFrom, disposedOn, plan)
 * @param {{country?: string}} [ctx]
 * @returns {{lowValue: boolean, years: number, plan: {year: number, amount: string, residual: string, booked: boolean}[], disposal: {year: number, residual: string}|null}}
 */
export function depreciationPlan(asset, ctx = {}) {
  const country = ctx.country || 'SK';
  const { rule, group, start } = depreciationRule(asset, country);
  const cost = round(asset.cost, 2);
  if (cmp(cost, '0') <= 0) throw new CoreError('AMOUNT_INVALID', 'asset cost must be positive');
  if (isLowValue(asset, country)) return { lowValue: true, years: group.years, plan: [], disposal: null };
  const accelerated = asset.method === 'ACCELERATED';
  if (accelerated && !group.accelerated) throw new CoreError('LEDGER_ACCELERATED_NOT_ALLOWED', `group ${group.g} cannot be depreciated faster`);
  const disposedOn = asset.disposedOn && asset.disposedOn >= start ? asset.disposedOn : null;
  const booked = new Map((asset.plan || []).map(p => [p.year, Boolean(p.booked)]));
  const y0 = yearOf(start);
  const m0 = month(start);
  const plan = [];
  let residual = cost;
  for (let i = 0; !isZero(residual) && i < group.years + 2; i += 1) {
    const year = y0 + i;
    const disposalYear = disposedOn && yearOf(disposedOn) === year;
    if (disposedOn && yearOf(disposedOn) < year) break;
    let months = i === 0 ? 13 - m0 : 12;
    if (disposalYear) months = i === 0 ? month(disposedOn) - m0 : month(disposedOn) - 1;
    const share = div(String(Math.max(0, months)), '12', 10);
    let base;
    if (!accelerated) {
      base = mul(div(cost, String(group.years), 10), share);
    } else if (i === 0) {
      const firstShare = rule.acceleratedFirstYearProrata || disposalYear ? share : '1';
      base = mul(div(cost, String(group.accelerated.first), 10), firstShare);
    } else {
      const left = group.accelerated.next - i;
      base = left <= 1 ? residual : div(mul('2', residual), String(left), 10);
      if (disposalYear) base = mul(base, share);
    }
    const amount = min(roundYear(base, rule), residual);
    residual = round(sub(residual, amount), 2);
    plan.push({ year, amount, residual, booked: booked.get(year) || false });
    if (disposalYear) break;
  }
  const disposal = disposedOn ? { year: yearOf(disposedOn), residual } : null;
  return { lowValue: false, years: group.years, plan, disposal };
}

/** Tax depreciation of one asset in a year ("0.00" outside its plan). */
export function depreciationInYear(asset, year, ctx = {}) {
  const entry = depreciationPlan(asset, ctx).plan.find(p => p.year === Number(year));
  return entry ? entry.amount : '0.00';
}

/**
 * Accounting depreciation: straight monthly over a useful life chosen by
 * the user (lifeMonths, default the tax years), from the month of use.
 * @returns {{year: number, amount: string, residual: string}[]}
 */
export function accountingPlan(asset, { lifeMonths = null, country = 'SK' } = {}) {
  const { group, start } = depreciationRule(asset, country);
  const life = Number(lifeMonths || asset.accountingLifeMonths || group.years * 12);
  if (!Number.isInteger(life) || life < 1) throw new CoreError('LEDGER_LIFE_INVALID', `invalid useful life ${lifeMonths}`);
  const cost = round(asset.cost, 2);
  const perMonth = div(cost, String(life), 10);
  const out = [];
  let residual = cost;
  let monthsLeft = life;
  let year = yearOf(start);
  let firstMonth = month(start);
  while (monthsLeft > 0 && !isZero(residual)) {
    const months = Math.min(13 - firstMonth, monthsLeft);
    monthsLeft -= months;
    const amount = monthsLeft === 0 ? residual : min(round(mul(perMonth, String(months)), 2), residual);
    residual = round(sub(residual, amount), 2);
    out.push({ year, amount, residual });
    year += 1;
    firstMonth = 1;
  }
  return out;
}

/** Rows of tax depreciation for the peňažný denník of a year (booked at 31 December). */
export function depreciationRows(assets, year, ctx = {}) {
  return (assets || []).filter(a => a && !a.deleted).flatMap(asset => {
    const amount = depreciationInYear(asset, year, ctx);
    if (isZero(amount)) return [];
    return [{ id: `dep:${asset.id}:${year}`, date: `${year}-12-31`, number: asset.inventoryNumber || null, text: asset.name, category: 'EXPENSE_TAX_OTHER', amount, assetId: asset.id }];
  });
}
