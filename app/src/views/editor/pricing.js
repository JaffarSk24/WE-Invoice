// The price of a price list item for a client: priceFor of the core stock
// module (price levels, the client's own price, quantity discounts). An
// item it cannot price keeps its own list price, so a line is never left
// empty.
import { priceFor } from '@we-invoice/core';
import { fold } from '../documents/rows.js';

/**
 * @returns {{unitPrice: string|null, priceType: string, discountPct: string|null}}
 */
export function clientPrice(item, { contact = null, date = null, qty = '1', priceLevels = [] } = {}) {
  try {
    const price = priceFor(item, contact, qty, date, { priceLevels });
    return { unitPrice: price.unitPrice, priceType: price.priceType || item.priceType || 'NET', discountPct: price.discountPct ?? null };
  } catch (e) {
    console.warn('Client price could not be applied, the list price is used', e);
    return { unitPrice: item.price ?? null, priceType: item.priceType || 'NET', discountPct: null };
  }
}

/** Price list items matching a query by name or code, at most 8, as suggestions. */
export function searchItems(items, query) {
  const q = fold(query);
  return (items || [])
    .filter(i => fold(i.name).includes(q) || (i.code && fold(i.code).includes(q)))
    .slice(0, 8)
    .map(i => ({ id: i.id, label: i.name, hint: [i.code, i.price && `${i.price} ${i.currency || 'EUR'}`].filter(Boolean).join(' · ') }));
}
