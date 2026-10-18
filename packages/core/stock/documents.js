// Stock moves that documents cause (03-features.md § 3.4): an issued
// invoice, delivery note or sales receipt takes goods out of stock, a
// received invoice brings them in at its net price, a credit note marked
// as a return of goods (stockReturn) brings them back. Only lines of
// stock-tracked items move stock. The app stores what movesForDocument
// returns and replaces it when the document changes (reconcileDocumentMoves),
// so issuing the same document twice never doubles a move.
//
// Goods leave stock once: an invoice whose goods went out on a delivery
// note (a delivery note made from the invoice, the invoice made from
// delivery notes, or both made from the same order) moves nothing itself.
import { CoreError } from '../errors.js';
import { div, cmp, abs, isZero } from '../money/index.js';
import { lineAmounts, isItemLine } from '../vat/lines.js';

const ISSUING = new Set(['INVOICE', 'DELIVERY_NOTE', 'SALES_RECEIPT']);
const RECEIVING = new Set(['RECEIVED_INVOICE']);
// Corrections move stock only when the user marked the goods as returned.
const RETURNS = Object.freeze({ CREDIT_NOTE: 'RECEIPT', RECEIVED_CREDIT_NOTE: 'ISSUE' });
const INACTIVE = new Set(['DRAFT', 'CANCELLED']);

const isActive = (doc) => doc && !doc.deleted && !INACTIVE.has(doc.status || 'DRAFT');
const linksOf = (doc, kind) => (doc.links || []).filter(l => l.kind === kind && l.docId).map(l => l.docId);

function itemLookup(items) {
  if (items instanceof Map) return (id) => items.get(id) || null;
  const map = new Map((items || []).map(i => [i.id, i]));
  return (id) => map.get(id) || null;
}

/**
 * True when the goods of an invoice went out on a delivery note, so the
 * invoice itself must not move stock.
 */
export function deliveredByNote(invoice, documents = []) {
  if (linksOf(invoice, 'DELIVERY_FOR').length) return true;
  const orders = new Set(linksOf(invoice, 'FROM_ORDER'));
  return documents.some(doc => doc.kind === 'DELIVERY_NOTE' && doc.id !== invoice.id && isActive(doc)
    && (linksOf(doc, 'DELIVERY_FOR').includes(invoice.id) || linksOf(doc, 'FROM_ORDER').some(id => orders.has(id))));
}

function moveKindOf(document) {
  if (ISSUING.has(document.kind)) return 'ISSUE';
  if (RECEIVING.has(document.kind)) return 'RECEIPT';
  if (RETURNS[document.kind] && document.stockReturn === true) return RETURNS[document.kind];
  return null;
}

function moveDate(document) {
  const received = document.kind.startsWith('RECEIVED_');
  return (received ? document.receivedDate : document.deliveryDate) || document.taxDate || document.issueDate;
}

// Cost of a received line in EUR per unit: net for a VAT payer (the input
// VAT is deducted), with VAT for anyone who cannot deduct it (a non-payer
// or a person registered under § 7).
function receivedUnitCost(line, document, company) {
  const amounts = lineAmounts(line);
  const deducts = !company || company.vatMode === 'PAYER';
  let amount = deducts ? amounts.net : amounts.total;
  if (document.currency && document.currency !== 'EUR' && document.fxRate && !isZero(document.fxRate)) amount = div(amount, document.fxRate, 10);
  return div(abs(amount), abs(line.qty), 4);
}

/**
 * Moves a document causes, as fields of new stockMoves records.
 * @param {object} document
 * @param {{items: Array<object>|Map<string, object>, documents?: Array<object>, warehouseId?: string|null, company?: object}} ctx
 *   items: the price list (only stockTracked items move); documents: all
 *   documents, to see delivery notes; warehouseId: the default warehouse
 *   for lines without one
 * @returns {Array<object>} empty for drafts, cancelled documents and kinds without stock effect
 */
export function movesForDocument(document, ctx = {}) {
  if (!isActive(document)) return [];
  const kind = moveKindOf(document);
  if (!kind) return [];
  if (document.kind === 'INVOICE' && deliveredByNote(document, ctx.documents || [])) return [];
  const item = itemLookup(ctx.items);
  const date = moveDate(document);
  const moves = [];
  for (const line of document.lines || []) {
    if (!isItemLine(line) || !line.itemId) continue;
    const record = item(line.itemId);
    if (!record || record.deleted || !record.stockTracked) continue;
    if (isZero(line.qty)) continue;
    const warehouseId = line.warehouseId || document.warehouseId || ctx.warehouseId;
    if (!warehouseId) throw new CoreError('STOCK_WAREHOUSE_MISSING', `no warehouse for line ${line.id}`, { lineId: line.id });
    // A negative quantity on a sale is goods coming back, and the reverse.
    const negative = cmp(line.qty, '0') < 0;
    const moveKind = negative ? (kind === 'ISSUE' ? 'RECEIPT' : 'ISSUE') : kind;
    const unitCost = kind === 'RECEIPT' && !negative && document.kind === 'RECEIVED_INVOICE' ? receivedUnitCost(line, document, ctx.company) : null;
    moves.push({
      kind: moveKind, date, warehouseId, targetWarehouseId: null, itemId: line.itemId, qty: abs(line.qty), unitCost,
      docId: document.id, note: document.number || null
    });
  }
  return moves;
}

const signature = (m) => [m.kind, m.date, m.warehouseId, m.targetWarehouseId || '', m.itemId, m.qty, m.unitCost || ''].join('|');

/**
 * What to change so the stored moves of a document equal the wanted ones:
 * moves that already match stay untouched.
 * @param {Array<object>} existing  live moves with docId of the document
 * @param {Array<object>} wanted  result of movesForDocument
 * @returns {{insert: Array<object>, remove: Array<object>}}
 */
export function reconcileDocumentMoves(existing, wanted) {
  const pool = new Map();
  for (const move of (existing || []).filter(m => !m.deleted)) {
    const k = signature(move);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(move);
  }
  const insert = [];
  for (const move of wanted || []) {
    const same = pool.get(signature(move));
    if (same && same.length) same.shift();
    else insert.push(move);
  }
  return { insert, remove: [...pool.values()].flat() };
}

/**
 * Other documents whose moves may change once this one is issued: the
 * invoice a delivery note was made for, and the invoices of the same order.
 * @returns {string[]}
 */
export function documentsAffectedBy(document, documents = []) {
  if (document.kind !== 'DELIVERY_NOTE') return [];
  const ids = new Set(linksOf(document, 'DELIVERY_FOR'));
  const orders = new Set(linksOf(document, 'FROM_ORDER'));
  if (orders.size) {
    documents.filter(d => d.kind === 'INVOICE' && linksOf(d, 'FROM_ORDER').some(id => orders.has(id))).forEach(d => ids.add(d.id));
  }
  ids.delete(document.id);
  return [...ids];
}

// FNV-1a, 32 bits, as 8 hex digits: short and the same on every device.
function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Record ids for the moves of a document, derived from the document and
 * the move, so two devices that issue the same document store the same
 * records and the sync merges them instead of doubling the stock effect.
 * @param {string} docId
 * @param {Array<object>} moves  moves of that document
 * @param {Set<string>} [taken]  ids already used (tombstones included); a taken id gets a suffix
 * @returns {string[]}
 */
export function documentMoveIds(docId, moves, taken = new Set()) {
  const seen = new Map();
  const prefix = String(docId).slice(0, 50);
  return (moves || []).map(move => {
    const sig = signature(move);
    const n = seen.get(sig) || 0;
    seen.set(sig, n + 1);
    const base = `${prefix}~${fnv1a(`${sig}#${n}`)}`;
    let id = base;
    for (let r = 1; taken.has(id); r += 1) id = `${base}r${r}`;
    taken.add(id);
    return id;
  });
}
