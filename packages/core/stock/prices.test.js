// Prices for a client: list price, price levels, the client's own price
// and quantity discounts.
import { describe, it, expect } from 'vitest';
import { priceFor } from './index.js';

const item = { id: 'i1', price: '100', priceType: 'NET', prices: { vo: '80' }, qtyBreaks: [{ minQty: '10', discountPct: '5' }, { minQty: '50', discountPct: '8' }] };
const levels = [
  { id: 'vo', name: 'Veľkoobchod', discountPct: null },
  { id: 'pct', name: 'Partner', discountPct: '15', qtyBreaks: [{ minQty: '10', discountPct: '7' }] },
  { id: 'old', name: 'Akcia', discountPct: '50', validFrom: '2026-01-01', validTo: '2026-03-31' }
];
const ctx = { priceLevels: levels };

describe('priceFor', () => {
  it('gives the list price without a client', () => {
    expect(priceFor(item, null, '1', '2026-10-18', ctx)).toEqual({ unitPrice: '100', priceType: 'NET', discountPct: null, netUnitPrice: '100', source: 'list', priceLevelId: null });
  });

  it('takes the price of the item on the client level', () => {
    expect(priceFor(item, { priceLevelId: 'vo' }, '1', '2026-10-18', ctx)).toMatchObject({ unitPrice: '80', source: 'level', priceLevelId: 'vo' });
  });

  it('applies the level discount when the item has no level price', () => {
    expect(priceFor(item, { priceLevelId: 'pct' }, '1', '2026-10-18', ctx)).toMatchObject({ unitPrice: '85.0000', source: 'level' });
  });

  it('ignores a level outside its validity', () => {
    expect(priceFor(item, { priceLevelId: 'old' }, '1', '2026-10-18', ctx)).toMatchObject({ unitPrice: '100', source: 'list', priceLevelId: null });
    expect(priceFor(item, { priceLevelId: 'old' }, '1', '2026-02-01', ctx)).toMatchObject({ unitPrice: '50.0000', source: 'level' });
  });

  it('gives the quantity discount as a line discount, the better of item and level', () => {
    expect(priceFor(item, null, '10', null, ctx)).toMatchObject({ discountPct: '5', netUnitPrice: '95.0000' });
    expect(priceFor(item, null, '60', null, ctx)).toMatchObject({ discountPct: '8' });
    expect(priceFor(item, { priceLevelId: 'pct' }, '10', null, ctx)).toMatchObject({ unitPrice: '85.0000', discountPct: '7', netUnitPrice: '79.0500' });
  });

  it('keeps the client own price final', () => {
    expect(priceFor(item, { priceLevelId: 'vo', prices: { i1: '70.5' } }, '100', null, ctx)).toMatchObject({ unitPrice: '70.5', discountPct: null, source: 'contact' });
  });

  it('keeps the price type of the item', () => {
    expect(priceFor({ ...item, priceType: 'GROSS' }, null).priceType).toBe('GROSS');
  });

  it('refuses an item without a price', () => {
    expect(() => priceFor({ id: 'x', price: '' })).toThrow(expect.objectContaining({ code: 'ITEM_PRICE_INVALID' }));
  });
});
