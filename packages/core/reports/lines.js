// Line amounts for the reports by item. The full EN 16931 line calculation
// (vat/lines.js) checks every field and is too slow to run over tens of
// thousands of lines on each redraw; the reports only need the line net
// amount, so this is the same arithmetic on big.js without the checks.
// A line the fast path cannot read falls back to the full calculation.
import Big from 'big.js';
import { lineAmounts } from '../vat/index.js';

const HUNDRED = new Big(100);

function num(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  return new Big(value);
}

/** Line net amount (BT-131) as a Big, or null for a line without amounts. */
export function fastLineNet(line) {
  if (!line || (line.kind && line.kind !== 'ITEM')) return null;
  try {
    const qty = new Big(line.qty);
    let unit = new Big(line.unitPrice);
    if (line.priceType === 'GROSS') {
      const rate = line.vatCategory === 'S' ? num(line.vatRate, new Big(0)) : new Big(0);
      unit = unit.div(rate.div(HUNDRED).plus(1)).round(4, Big.roundHalfUp);
    }
    const base = num(line.baseQty, new Big(1));
    const gross = qty.times(unit).div(base).round(2, Big.roundHalfUp);
    const pct = num(line.discountPct, null);
    if (!pct) return gross;
    return gross.minus(gross.times(pct).div(HUNDRED).round(2, Big.roundHalfUp));
  } catch {
    try {
      return new Big(lineAmounts(line).net);
    } catch (e) {
      console.warn('A document line could not be read for the report', e);
      return null;
    }
  }
}

/** The key that groups a line by item: the price list id, else its name. */
export function itemKey(line) {
  if (line.itemId) return line.itemId;
  const name = String(line.name || '').trim().toLowerCase();
  return name ? `name:${name}` : null;
}
