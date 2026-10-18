// Predajka (03-features.md § 3.6): a quick sale for cash or card without a
// client. The cart becomes an issued SALES_RECEIPT with its payment, the
// stock moves follow from movesForDocument. Stage 1 has no eKasa link:
// vrpSummary() gives what the seller types into the virtual cash register
// (VRP2) by hand. A cash payment is rounded to the legal step (zákon
// č. 18/1996 Z. z., § 3 ods. 4); a card payment is not.
import { CoreError } from '../errors.js';
import { add, div, round, cmp, isZero } from '../money/index.js';
import { uuidv7 } from '../ids/uuid.js';
import { issueDocument } from '../documents/issue.js';
import { documentStatus } from '../documents/status.js';
import { localDate } from '../documents/dates.js';
import { lineAmounts, isItemLine } from '../vat/lines.js';
import { priceFor } from './prices.js';

export const SALES_RECEIPT_METHODS = Object.freeze(['CASH', 'CARD']);
const DEFAULT_MASK = 'PR{YYYY}{N:4}';

/**
 * The numbering series of sales receipts: the default one of the company,
 * or a new yearly series to store when the company has none yet.
 * @returns {{series: object, created: boolean}}
 */
export function salesReceiptSeries(company, { id = null, name = 'PR' } = {}) {
  const list = (company?.series || []).filter(s => s.kind === 'SALES_RECEIPT');
  const found = list.find(s => s.isDefault) || list[0];
  if (found) return { series: found, created: false };
  return {
    series: { id: id || uuidv7(), name, kind: 'SALES_RECEIPT', mask: DEFAULT_MASK, vsMask: null, reset: 'YEARLY', isDefault: true, counters: {} },
    created: true
  };
}

/**
 * A document line for an item of the cart, at the list price for a sale
 * without a client (quantity discounts apply).
 * @returns {object}
 */
export function salesReceiptLine(item, qty, { company = null, date = null, warehouseId = null, priceLevels = [] } = {}) {
  const price = priceFor(item, null, qty, date, { priceLevels });
  const nonPayer = company?.vatMode === 'NONPAYER';
  return {
    id: uuidv7(),
    kind: 'ITEM',
    itemId: item.id,
    name: item.name,
    description: '',
    qty: String(qty),
    unit: item.unit || { code: 'C62', label: '' },
    unitPrice: price.unitPrice,
    baseQty: null,
    priceType: price.priceType,
    discountPct: price.discountPct,
    vatRate: nonPayer ? null : (item.vatRate ?? null),
    vatCategory: nonPayer ? 'O' : (item.vatCategory || 'S'),
    exemptionReasonCode: null,
    exemptionReasonText: null,
    accountingCategory: item.accountingCategory || null,
    warehouseId
  };
}

/**
 * Issues a sales receipt for a cart.
 * @param {Array<{item: object, qty: string}>} cart
 * @param {{company: object, series: object, method?: 'CASH'|'CARD', paid?: string|null, warehouseId?: string|null,
 *   date?: string, now?: string, taken?: Iterable<string>, priceLevels?: Array<object>}} ctx
 *   paid: amount received when the buyer pays only part (defaults to the whole payable amount)
 * @returns {{document: object, series: object}} the issued, paid receipt and the series with its counter advanced
 */
export function issueSalesReceipt(cart, ctx) {
  const { company, series } = ctx || {};
  const method = ctx.method || 'CASH';
  if (!SALES_RECEIPT_METHODS.includes(method)) throw new CoreError('PAYMENT_METHOD_INVALID', `not a receipt payment: ${method}`);
  const entries = (cart || []).filter(e => e && e.item && e.qty && !isZero(e.qty));
  if (!entries.length) throw new CoreError('CART_EMPTY', 'the cart is empty');
  if (entries.some(e => cmp(e.qty, '0') < 0)) throw new CoreError('CART_QTY_INVALID', 'a cart quantity is negative');
  const now = ctx.now || new Date().toISOString();
  const date = ctx.date || localDate(now);
  const lineCtx = { company, date, warehouseId: ctx.warehouseId || null, priceLevels: ctx.priceLevels || [] };
  const draft = {
    id: uuidv7(),
    createdAt: now,
    updatedAt: now,
    kind: 'SALES_RECEIPT',
    status: 'DRAFT',
    issueDate: date,
    deliveryDate: date,
    dueDate: date,
    currency: company?.defaults?.currency || 'EUR',
    buyer: null,
    contactId: null,
    lines: entries.map(e => salesReceiptLine(e.item, e.qty, lineCtx)),
    docDiscount: null,
    paymentMethod: method,
    links: [],
    payments: [],
    attachments: [],
    sendLog: [],
    tags: [],
    language: company?.defaults?.language || 'sk'
  };
  const issued = issueDocument(draft, { company, series, now, today: date, taken: ctx.taken, cashRounding: method === 'CASH' });
  const document = issued.document;
  const payable = document.totals.payable;
  const paid = ctx.paid === null || ctx.paid === undefined || ctx.paid === '' ? payable : round(ctx.paid, 2);
  if (cmp(paid, '0') < 0) throw new CoreError('AMOUNT_INVALID', 'a paid amount cannot be negative');
  if (!isZero(paid)) {
    document.payments = [{
      id: uuidv7(), date, amount: paid, currency: document.currency, method, source: method === 'CASH' ? 'CASH' : 'MANUAL',
      bankTxId: null, cashBookId: null, ekasaReceiptId: null, ekasaOkp: null, note: null
    }];
  }
  document.status = documentStatus(document, date);
  return { document, series: issued.series };
}

/**
 * What to type into the virtual cash register (VRP2) for a receipt: each
 * line with its price including VAT, the VAT summary and the amounts paid.
 * @returns {{number: string|null, date: string, method: string, lines: Array<object>, vat: Array<object>,
 *   total: string, rounding: string, payable: string, paid: string}}
 */
export function vrpSummary(document) {
  const lines = (document.lines || []).filter(isItemLine).map(line => {
    const a = lineAmounts(line);
    return { name: line.name, qty: line.qty, unitPrice: round(div(a.total, line.qty, 10), 2), vatRate: a.rate, total: a.total };
  });
  const totals = document.totals || {};
  const vat = (totals.breakdown || []).map(b => ({ rate: b.rate, base: b.base, vat: b.vat, total: round(add(b.base, b.vat), 2) }));
  const paid = round((document.payments || []).filter(p => !p.deleted).reduce((s, p) => add(s, p.amount), '0'), 2);
  return {
    number: document.number || null,
    date: document.issueDate,
    method: document.paymentMethod,
    lines,
    vat,
    total: totals.gross || '0.00',
    rounding: totals.rounding || '0.00',
    payable: totals.payable || '0.00',
    paid
  };
}
