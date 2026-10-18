// Price list entries as plain data: a blank item, the checks before
// saving, the price with and without VAT (the other one computed from the
// entered one, on decimal strings) and search. Pure functions, shared by
// the screens, the CSV import and the tests.
import { schema, grossToNet, add, mul, div, round } from '@we-invoice/core';

// UN/ECE Recommendation 20 codes offered in the unit picker; the label
// shown and printed comes from the dictionaries (items.unit.<CODE>).
export const UNIT_CODES = Object.freeze(['C62', 'H87', 'HUR', 'DAY', 'MON', 'KGM', 'MTR', 'MTK', 'MTQ', 'LTR', 'SET', 'KMT', 'TNE']);

export function blankItem(overrides = {}) {
  return {
    name: '', code: null, barcode: null, unit: { code: 'C62', label: '' }, price: '0', priceType: 'NET',
    vatRate: '23', vatCategory: 'S', currency: 'EUR', stockTracked: false, accountingCategory: null, description: '',
    ...overrides
  };
}

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const orNull = (v) => (text(v) ? text(v) : null);

// "12,50" or "12.50" -> "12.50"; anything else -> null.
export function decimalText(value) {
  const s = text(value).replace(/\s/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? s : null;
}

// Cleans an item from the form or the import. Returns { item, errors }
// with error codes (crm.error.<CODE>).
export function normalizeItem(input) {
  const i = { ...blankItem(), ...input };
  const errors = {};
  const price = decimalText(i.price);
  const category = schema.VAT_CATEGORIES.includes(i.vatCategory) ? i.vatCategory : 'S';
  const rate = category === 'S' ? decimalText(i.vatRate) : null;
  const unitCode = text(i.unit?.code).toUpperCase();
  const item = {
    ...i,
    name: text(i.name),
    code: orNull(i.code),
    barcode: orNull(i.barcode),
    unit: { code: unitCode.slice(0, 3), label: text(i.unit?.label) },
    price: price ?? text(i.price),
    priceType: i.priceType === 'GROSS' ? 'GROSS' : 'NET',
    vatCategory: category,
    vatRate: rate,
    currency: /^[A-Z]{3}$/.test(text(i.currency)) ? text(i.currency) : 'EUR',
    accountingCategory: orNull(i.accountingCategory),
    description: text(i.description)
  };
  if (!item.name) errors.name = 'NAME_REQUIRED';
  if (price === null) errors.price = 'PRICE_INVALID';
  if (category === 'S' && rate === null) errors.vatRate = 'VAT_RATE_INVALID';
  if (!item.unit.code && !item.unit.label) errors.unit = 'UNIT_REQUIRED';
  return { item, errors };
}

// Both prices of an item, rounded for display: the entered one as it is,
// the other computed by the item's VAT rate (0 outside category S).
export function bothPrices(item) {
  const rate = item.vatCategory === 'S' ? (item.vatRate || '0') : '0';
  const price = decimalText(item.price) || '0';
  if (item.priceType === 'GROSS') return { net: round(grossToNet(price, rate), 2), gross: round(price, 2) };
  return { net: round(price, 2), gross: round(add(price, div(mul(price, rate), '100', 10)), 2) };
}

const fold = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function searchItems(items, query, category = '') {
  const q = fold(query);
  return items
    .filter(i => !category || i.accountingCategory === category)
    .filter(i => !q || [i.name, i.code, i.barcode, i.description, i.accountingCategory].map(fold).join(' ').includes(q))
    .sort((a, b) => text(a.name).localeCompare(text(b.name), 'sk'));
}

export function categoriesOf(items) {
  return Array.from(new Set(items.map(i => i.accountingCategory).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'sk'));
}

// The document line an item becomes (for the editor of WP-SALES).
export function itemToLine(item, id) {
  return {
    id, kind: 'ITEM', itemId: item.id || null, name: item.name, description: item.description || '', qty: '1',
    unit: { ...item.unit }, unitPrice: decimalText(item.price) || '0', priceType: item.priceType,
    discountPct: null, vatRate: item.vatCategory === 'S' ? item.vatRate : null, vatCategory: item.vatCategory,
    accountingCategory: item.accountingCategory || null
  };
}
