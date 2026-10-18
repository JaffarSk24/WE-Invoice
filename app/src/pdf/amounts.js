// Amounts of one printed line and the amount still due. Document totals
// come from the core (document.totals, computed at issue) and are never
// recomputed here; a line carries only qty, unit price, discount and rate,
// so its printed net, VAT and gross are derived here with big.js, half-up
// to two places (EN 16931). A line that already carries net/vat/gross
// (a future core field) is printed as it is.
import Big from 'big.js';

const HALF_UP = 1;
const ZERO = '0.00';

export function big(value) {
  try {
    return new Big(value === null || value === undefined || value === '' ? 0 : value);
  } catch {
    return new Big(0);
  }
}

export const money = (value) => big(value).round(2, HALF_UP).toFixed(2);

export function isZero(value) {
  return big(value).eq(0);
}

export function isNegative(value) {
  return big(value).lt(0);
}

export function negate(value) {
  return big(value).times(-1).round(2, HALF_UP).toFixed(2);
}

export function sum(values) {
  return values.reduce((acc, v) => acc.plus(big(v)), new Big(0)).round(2, HALF_UP).toFixed(2);
}

/**
 * @param {object} line  a document line (kind ITEM)
 * @param {boolean} vatPayer  false: no VAT anywhere, gross equals net
 * @returns {{unitNet: string, net: string, vat: string, gross: string, discount: string}}
 */
export function lineAmounts(line, vatPayer = true) {
  if (line.net !== undefined && line.gross !== undefined) {
    return { unitNet: money(line.unitNet ?? line.unitPrice), net: money(line.net), vat: money(line.vat ?? 0), gross: money(line.gross), discount: money(line.discount ?? 0) };
  }
  const rate = vatPayer && line.vatCategory === 'S' ? big(line.vatRate) : new Big(0);
  const factor = rate.div(100).plus(1);
  const unitPrice = big(line.unitPrice);
  const unitNet = line.priceType === 'GROSS' ? unitPrice.div(factor) : unitPrice;
  const qty = big(line.qty);
  const listNet = unitNet.times(qty);
  const discount = line.discountPct ? listNet.times(big(line.discountPct)).div(100) : new Big(0);
  const net = listNet.minus(discount).round(2, HALF_UP);
  const vat = net.times(rate).div(100).round(2, HALF_UP);
  return {
    unitNet: unitNet.round(2, HALF_UP).toFixed(2),
    net: net.toFixed(2),
    vat: vat.toFixed(2),
    gross: net.plus(vat).toFixed(2),
    discount: discount.round(2, HALF_UP).toFixed(2)
  };
}

/**
 * Lines with their amounts; SUBTOTAL lines get the running sum of the item
 * lines above them (since the previous subtotal).
 */
export function linesWithAmounts(lines, vatPayer = true) {
  let runNet = new Big(0);
  let runGross = new Big(0);
  return (lines || []).map(line => {
    if (line.kind === 'SUBTOTAL') {
      const row = { ...line, amounts: { net: runNet.toFixed(2), gross: runGross.toFixed(2), vat: runGross.minus(runNet).toFixed(2) } };
      runNet = new Big(0);
      runGross = new Big(0);
      return row;
    }
    if (line.kind === 'TEXT') return { ...line, amounts: null };
    const amounts = lineAmounts(line, vatPayer);
    runNet = runNet.plus(amounts.net);
    runGross = runGross.plus(amounts.gross);
    return { ...line, amounts };
  });
}

/** What the customer still has to pay: payable minus the payments recorded. */
export function amountDue(document) {
  const payable = big(document.totals ? document.totals.payable : 0);
  const paid = (document.payments || []).reduce((acc, p) => acc.plus(big(p.amount)), new Big(0));
  const due = payable.minus(paid).round(2, HALF_UP);
  return due.lt(0) ? ZERO : due.toFixed(2);
}

export function paidAmount(document) {
  return sum((document.payments || []).map(p => p.amount));
}
