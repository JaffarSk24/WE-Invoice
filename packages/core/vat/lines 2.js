// One document line by EN 16931 (04-peppol.md § 4.4 step 1): the net unit
// price (prices entered with VAT are converted to net at 4 places), the
// line allowance from the percentage discount and the line net amount
// BT-131 rounded to 2 places. Nothing here knows about other lines.
import { add, sub, mul, div, round, cmp, isZero } from '../money/index.js';
import { CoreError } from '../errors.js';
import { VAT_CATEGORIES } from '../schema/enums.js';

const CATEGORIES = new Set(VAT_CATEGORIES);

/**
 * Unit price with VAT to unit price without, rounded half-up to 4 places.
 * @param {string} price  gross unit price
 * @param {string} rate  percentage, e.g. "23"
 * @returns {string}
 */
export function grossToNet(price, rate) {
  const divisor = add('1', div(rate || '0', '100', 6));
  return round(div(price, divisor, 10), 4);
}

/**
 * VAT rate of a line as the breakdown needs it: the given rate for S, "0"
 * for every other category and null for O (outside the scope of VAT, where
 * EN 16931 forbids a rate). A standard-rated line without a rate cannot be
 * computed.
 * @returns {{category: string, rate: string|null}}
 */
export function normalizeVat(line) {
  const category = line.vatCategory;
  if (!CATEGORIES.has(category)) throw new CoreError('VAT_CATEGORY_INVALID', `unknown VAT category ${category}`, { lineId: line.id });
  if (category === 'S') {
    if (line.vatRate === null || line.vatRate === undefined || line.vatRate === '') {
      throw new CoreError('VAT_RATE_REQUIRED', 'standard rated line without a rate', { lineId: line.id });
    }
    return { category, rate: round(line.vatRate, 2).replace(/\.?0+$/, '') || '0' };
  }
  return { category, rate: category === 'O' ? null : '0' };
}

/** Net unit price of a line: as entered for NET prices, converted for GROSS. */
export function unitNetPrice(line, rate) {
  return line.priceType === 'GROSS' ? grossToNet(line.unitPrice, rate) : line.unitPrice;
}

/**
 * Amounts of one item line. `gross` is the line amount before the line
 * discount (BT-148 x BT-129), `allowance` the discount (BT-136), `net` the
 * line net amount (BT-131). For a line entered with VAT, `grossDiff` is the
 * difference between the total with VAT the user would expect from the
 * gross price and the total the net calculation gives; it is shown, never
 * hidden by adjusting the figures (§ 4.4 step 7).
 */
export function lineAmounts(line) {
  const { category, rate } = normalizeVat(line);
  const baseQty = line.baseQty === null || line.baseQty === undefined || line.baseQty === '' ? '1' : line.baseQty;
  if (isZero(baseQty)) throw new CoreError('DIVISION_BY_ZERO', 'base quantity is zero', { lineId: line.id });
  const unitNet = unitNetPrice(line, rate);
  const pct = line.discountPct === null || line.discountPct === undefined || line.discountPct === '' ? '0' : line.discountPct;
  const gross = round(div(mul(line.qty, unitNet), baseQty, 10), 2);
  const allowance = round(div(mul(gross, pct), '100', 10), 2);
  const net = sub(gross, allowance);
  const vat = category === 'S' ? round(div(mul(net, rate), '100', 10), 2) : '0.00';
  let grossDiff = null;
  if (line.priceType === 'GROSS') {
    const enteredGross = round(div(mul(line.qty, line.unitPrice), baseQty, 10), 2);
    const enteredNet = sub(enteredGross, round(div(mul(enteredGross, pct), '100', 10), 2));
    const diff = sub(enteredNet, add(net, vat));
    if (cmp(diff, '0') !== 0) grossDiff = diff;
  }
  return {
    id: line.id,
    category,
    rate,
    unitNet,
    gross,
    allowance,
    net: round(net, 2),
    vat,
    total: round(add(net, vat), 2),
    grossDiff,
    exemptionReasonCode: line.exemptionReasonCode || null,
    exemptionReasonText: line.exemptionReasonText || null
  };
}

/** Net amount of one line (BT-131), rounded to 2 places. @returns {string} */
export function lineNet(line) {
  return lineAmounts(line).net;
}

/** True for a line that carries amounts (headings and subtotals do not). */
export function isItemLine(line) {
  return !line.kind || line.kind === 'ITEM';
}
