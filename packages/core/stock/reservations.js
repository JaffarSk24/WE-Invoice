// Reservations (03-features.md § 3.4 and § 3.6): a received order that is
// open (issued, sent or accepted) holds its stock-tracked goods until a
// delivery note or an invoice made from it takes them out. What is free to
// sell is the quantity on hand minus what open orders hold.
import { add, sub, cmp } from '../money/index.js';
import { isItemLine } from '../vat/lines.js';

const OPEN = new Set(['ISSUED', 'SENT', 'ACCEPTED']);
const DELIVERING = new Set(['DELIVERY_NOTE', 'INVOICE']);
const DONE = new Set(['DRAFT', 'CANCELLED']);

function quantities(doc, tracked) {
  const map = new Map();
  for (const line of doc.lines || []) {
    if (!isItemLine(line) || !line.itemId || !tracked(line.itemId)) continue;
    if (cmp(line.qty, '0') <= 0) continue;
    map.set(line.itemId, add(map.get(line.itemId) || '0', line.qty));
  }
  return map;
}

/**
 * Quantity each open received order still holds, per item.
 * @param {Array<object>} documents  all documents
 * @param {{items?: Array<object>}} [ctx]  items: only stock-tracked ones are reserved (all when omitted)
 * @returns {Map<string, string>} itemId -> reserved quantity (never negative)
 */
export function stockReservations(documents, ctx = {}) {
  const trackedIds = ctx.items ? new Set(ctx.items.filter(i => i && !i.deleted && i.stockTracked).map(i => i.id)) : null;
  const tracked = (id) => !trackedIds || trackedIds.has(id);
  const docs = (documents || []).filter(d => d && !d.deleted);
  // What delivery notes and invoices made from each order took out.
  const delivered = new Map();
  for (const doc of docs) {
    if (!DELIVERING.has(doc.kind) || DONE.has(doc.status || 'DRAFT')) continue;
    for (const link of doc.links || []) {
      if (link.kind !== 'FROM_ORDER' || !link.docId) continue;
      const perOrder = delivered.get(link.docId) || new Map();
      // An invoice and a delivery note of the same order deliver the same goods once.
      for (const [itemId, qty] of quantities(doc, tracked)) {
        const key = `${doc.kind}|${itemId}`;
        perOrder.set(key, add(perOrder.get(key) || '0', qty));
      }
      delivered.set(link.docId, perOrder);
    }
  }
  const reserved = new Map();
  for (const order of docs) {
    if (order.kind !== 'ORDER_IN' || !OPEN.has(order.status)) continue;
    const out = delivered.get(order.id) || new Map();
    for (const [itemId, qty] of quantities(order, tracked)) {
      const notes = out.get(`DELIVERY_NOTE|${itemId}`) || '0';
      const invoices = out.get(`INVOICE|${itemId}`) || '0';
      const taken = cmp(notes, invoices) >= 0 ? notes : invoices;
      const rest = sub(qty, taken);
      if (cmp(rest, '0') > 0) reserved.set(itemId, add(reserved.get(itemId) || '0', rest));
    }
  }
  return reserved;
}

/**
 * Quantity free to sell: on hand minus reserved (may be negative).
 * @param {string} onHand
 * @param {string} [reserved]
 * @returns {string}
 */
export function availableStock(onHand, reserved = '0') {
  return sub(onHand || '0', reserved || '0');
}
