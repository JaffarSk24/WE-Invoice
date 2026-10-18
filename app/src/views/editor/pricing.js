// The price of a price list item for a client. The stock package owns
// price levels (priceFor in core stock); until it registers its provider
// through the "pricing:provider" event, the item's own price is used.
//   emit('pricing:provider', (item, { contact, date }) => '12.50' | null)
import { fold } from '../documents/rows.js';

let provider = null;

export function setPriceProvider(fn) {
  provider = typeof fn === 'function' ? fn : null;
}

/** The client's price of an item: the provider's answer, else the item price. */
export function clientPrice(item, { contact = null, date = null } = {}) {
  if (provider) {
    try {
      const price = provider(item, { contact, date });
      if (price !== null && price !== undefined && price !== '') return String(price);
    } catch (e) {
      if (!e || e.code !== 'NOT_IMPLEMENTED') console.warn('Price level could not be applied', e);
    }
  }
  return item.price ?? null;
}

/** Price list items matching a query by name or code, at most 8, as suggestions. */
export function searchItems(items, query) {
  const q = fold(query);
  return (items || [])
    .filter(i => fold(i.name).includes(q) || (i.code && fold(i.code).includes(q)))
    .slice(0, 8)
    .map(i => ({ id: i.id, label: i.name, hint: [i.code, i.price && `${i.price} ${i.currency || 'EUR'}`].filter(Boolean).join(' · ') }));
}
