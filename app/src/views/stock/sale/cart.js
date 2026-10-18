// The cart of the quick sale as plain data: adding an item (by click, by
// code or barcode from a scanner), changing a quantity, removing a line
// and the preview of the totals the receipt will have. No DOM here, so
// the rules are tested without a page.
import { add, cmp, isZero, computeTotals, salesReceiptLine } from '@we-invoice/core';

export function emptyCart() {
  return [];
}

/** Adds qty of an item (1 by default); an item already in the cart grows. */
export function addToCart(cart, item, qty = '1') {
  const found = cart.find(e => e.item.id === item.id);
  if (found) return cart.map(e => (e === found ? { ...e, qty: add(e.qty, qty) } : e));
  return [...cart, { item, qty: String(qty) }];
}

/** Sets a quantity; zero or less removes the line. */
export function setCartQty(cart, itemId, qty) {
  if (qty === null || qty === undefined || isZero(qty) || cmp(qty, '0') < 0) return cart.filter(e => e.item.id !== itemId);
  return cart.map(e => (e.item.id === itemId ? { ...e, qty: String(qty) } : e));
}

export function changeCartQty(cart, itemId, delta) {
  const found = cart.find(e => e.item.id === itemId);
  return found ? setCartQty(cart, itemId, add(found.qty, delta)) : cart;
}

export function removeFromCart(cart, itemId) {
  return cart.filter(e => e.item.id !== itemId);
}

/**
 * The item a scanned or typed code stands for: exact barcode, then exact
 * code (case does not matter). Only items that can be sold are searched.
 */
export function findByCode(items, code) {
  const text = String(code || '').trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  return items.find(i => i.barcode && String(i.barcode) === text) || items.find(i => i.code && String(i.code).toLowerCase() === lower) || null;
}

/** Items matching a search text by name, code or barcode. */
export function searchItems(items, query, limit = 60) {
  const q = String(query || '').trim().toLowerCase();
  const list = q ? items.filter(i => i.name.toLowerCase().includes(q) || String(i.code || '').toLowerCase().includes(q) || String(i.barcode || '') === q) : items;
  return list.slice().sort((a, b) => a.name.localeCompare(b.name)).slice(0, limit);
}

/**
 * Totals the receipt will have: gross, VAT and, for cash, the amount after
 * the legal rounding.
 * @returns {{gross: string, vat: string, net: string, payable: string, rounding: string, lines: Array<object>}}
 */
export function cartPreview(cart, { company = null, date = null, method = 'CASH' } = {}) {
  if (!cart.length) return { gross: '0.00', vat: '0.00', net: '0.00', payable: '0.00', rounding: '0.00', lines: [] };
  const lines = cart.map(e => salesReceiptLine(e.item, e.qty, { company, date }));
  const totals = computeTotals({ kind: 'SALES_RECEIPT', currency: 'EUR', issueDate: date, lines, docDiscount: null }, { cashRounding: method === 'CASH' });
  const amounts = new Map(totals.lines.map(l => [l.id, l]));
  return {
    gross: totals.gross, vat: totals.vat, net: totals.net, payable: totals.payable, rounding: totals.rounding,
    lines: lines.map((line, i) => ({ itemId: cart[i].item.id, total: amounts.get(line.id)?.total || '0.00' }))
  };
}
