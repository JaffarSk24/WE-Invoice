// Document level discount (BT-107) split over the VAT groups (§ 4.4 step
// 3): UBL needs one AllowanceCharge per category and rate, so a discount
// on the whole document is distributed over the groups in proportion to
// their line net sums. The split always adds up to the discount exactly;
// a rounding remainder lands on the largest group.
import { add, sub, mul, div, round, cmp, isZero, isNegative, abs, sum } from '../money/index.js';

/**
 * @param {Array<{key: string, lineNet: string}>} groups  VAT groups with their line net sums
 * @param {{pct?: string|null, amount?: string|null}|null|undefined} docDiscount
 * @returns {{allowances: Object<string, string>, charges: Object<string, string>}} amounts per group key
 */
export function allocateDocDiscount(groups, docDiscount) {
  const allowances = {};
  const charges = {};
  if (!docDiscount || !groups.length) return { allowances, charges };
  const hasPct = docDiscount.pct !== null && docDiscount.pct !== undefined && docDiscount.pct !== '';
  const hasAmount = docDiscount.amount !== null && docDiscount.amount !== undefined && docDiscount.amount !== '';
  if (!hasPct && !hasAmount) return { allowances, charges };

  const split = hasPct ? byPercent(groups, docDiscount.pct) : byAmount(groups, docDiscount.amount);
  for (const [key, value] of Object.entries(split)) {
    if (isZero(value)) continue;
    if (isNegative(value)) charges[key] = round(abs(value), 2);
    else allowances[key] = value;
  }
  return { allowances, charges };
}

function byPercent(groups, pct) {
  const out = {};
  for (const g of groups) out[g.key] = round(div(mul(g.lineNet, pct), '100', 10), 2);
  return out;
}

function byAmount(groups, amount) {
  const total = round(amount, 2);
  const base = sum(groups.map(g => g.lineNet));
  const out = {};
  if (isZero(base)) {
    // Nothing to weight by: the whole discount goes to the first group.
    groups.forEach((g, i) => { out[g.key] = i === 0 ? total : '0.00'; });
    return out;
  }
  let allocated = '0';
  let largest = groups[0];
  for (const g of groups) {
    out[g.key] = round(div(mul(total, g.lineNet), base, 10), 2);
    allocated = add(allocated, out[g.key]);
    if (cmp(abs(g.lineNet), abs(largest.lineNet)) > 0) largest = g;
  }
  const remainder = sub(total, allocated);
  if (!isZero(remainder)) out[largest.key] = round(add(out[largest.key], remainder), 2);
  return out;
}
