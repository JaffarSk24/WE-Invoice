// Predajka (03-features.md § 3.6): a quick sale for cash or card without a
// client. The cart becomes an issued SALES_RECEIPT with its payment, the
// stock moves follow from movesForDocument. Stage 1 has no eKasa link:
// vrpSummary() gives what the seller types into the virtual cash register
// (VRP2) by hand. A cash payment is rounded to the legal step (zákon
// č. 18/1996 Z. z., § 3 ods. 4); a card payment is not. Each line may take
// its own VAT choice (receipt-vat.js); a reverse-charge line makes the
// receipt name the buyer with the buyer's IČ DPH.
import { CoreError } from '../errors.js';
import { add, div, round, cmp, isZero } from '../money/index.js';
import { uuidv7 } from '../ids/uuid.js';
import { issueDocument } from '../documents/issue.js';
import { documentStatus } from '../documents/status.js';
import { localDate } from '../documents/dates.js';
import { lineAmounts, isItemLine, grossToNet } from '../vat/lines.js';
import { requiredTexts } from '../documents/particulars.js';
import { priceFor } from './prices.js';
import { salesReceiptVat, vatOfCategory, checkSalesReceiptBuyer } from './receipt-vat.js';

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

// VAT of a line: outside VAT for a non-payer (as before), the seller's
// choice when there is one, otherwise the item's own category and rate.
function lineVat(item, company, date, choice) {
  if (company?.vatMode === 'NONPAYER') return { vatCategory: 'O', vatRate: null, exemptionReasonCode: null, exemptionReasonText: null };
  const day = date || localDate();
  if (choice) return salesReceiptVat(choice, day, company);
  return vatOfCategory(item.vatCategory || 'S', item.vatRate ?? null, day);
}

/**
 * A document line for an item of the cart, at the list price for a sale
 * without a client (quantity discounts apply). `vat` is the VAT choice of
 * the line ("S:23", "AE"...); without it the item's own VAT applies. A
 * price with VAT on a line without VAT (reverse charge, exemption) is
 * turned into the price without VAT at the item's own rate, since that
 * is the price the buyer pays there.
 * @returns {object}
 */
export function salesReceiptLine(item, qty, { company = null, date = null, warehouseId = null, priceLevels = [], vat = null } = {}) {
  const price = priceFor(item, null, qty, date, { priceLevels });
  const nonPayer = company?.vatMode === 'NONPAYER';
  const tax = lineVat(item, company, date, vat);
  let unitPrice = price.unitPrice;
  let priceType = price.priceType;
  if (!nonPayer && priceType === 'GROSS' && tax.vatCategory !== 'S') {
    unitPrice = grossToNet(unitPrice, item.vatCategory === 'S' || !item.vatCategory ? (item.vatRate || '0') : '0');
    priceType = 'NET';
  }
  return {
    id: uuidv7(),
    kind: 'ITEM',
    itemId: item.id,
    name: item.name,
    description: '',
    qty: String(qty),
    unit: item.unit || { code: 'C62', label: '' },
    unitPrice,
    baseQty: null,
    priceType,
    discountPct: price.discountPct,
    vatRate: tax.vatRate,
    vatCategory: tax.vatCategory,
    exemptionReasonCode: tax.exemptionReasonCode,
    exemptionReasonText: tax.exemptionReasonText,
    accountingCategory: item.accountingCategory || null,
    warehouseId
  };
}

/**
 * Issues a sales receipt for a cart.
 * @param {Array<{item: object, qty: string, vat?: string|null}>} cart  vat: the VAT choice of the line
 * @param {{company: object, series: object, method?: 'CASH'|'CARD', paid?: string|null, warehouseId?: string|null,
 *   date?: string, now?: string, taken?: Iterable<string>, priceLevels?: Array<object>, buyer?: object|null}} ctx
 *   paid: amount received when the buyer pays only part (defaults to the whole payable amount);
 *   buyer: name and IČ DPH, required when a line is reverse charge (checkSalesReceiptBuyer)
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
  const lines = entries.map(e => salesReceiptLine(e.item, e.qty, { ...lineCtx, vat: e.vat || null }));
  const buyer = checkSalesReceiptBuyer(lines, ctx.buyer || null);
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
    buyer,
    contactId: buyer ? buyer.contactId : null,
    lines,
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
 * line with its price including VAT and its VAT category (a reverse-charge
 * or exempt line is entered without VAT, under its category, not as a
 * zero rate), the VAT summary per category and rate, the legal texts, the
 * buyer's IČ DPH when the receipt has one, and the amounts paid.
 * @returns {{number: string|null, date: string, method: string, lines: Array<object>, vat: Array<object>,
 *   texts: Array<{key: string, text: string}>, buyer: {name: string, icDph: string}|null, reverseCharge: boolean,
 *   total: string, rounding: string, payable: string, paid: string}}
 */
export function vrpSummary(document) {
  const lines = (document.lines || []).filter(isItemLine).map(line => {
    const a = lineAmounts(line);
    return {
      name: line.name, qty: line.qty, unitPrice: round(div(a.total, line.qty, 10), 2), category: a.category, vatRate: a.rate, total: a.total,
      exemption: a.exemptionReasonText || null
    };
  });
  const totals = document.totals || {};
  const vat = (totals.breakdown || []).map(b => ({ category: b.category, rate: b.rate, base: b.base, vat: b.vat, total: round(add(b.base, b.vat), 2) }));
  const texts = document.issueDate ? requiredTexts(document, null, document.issueDate).filter(x => x.key !== 'nonPayer') : [];
  const buyer = document.buyer && document.buyer.icDph ? { name: document.buyer.name, icDph: document.buyer.icDph } : null;
  const paid = round((document.payments || []).filter(p => !p.deleted).reduce((s, p) => add(s, p.amount), '0'), 2);
  return {
    number: document.number || null,
    date: document.issueDate,
    method: document.paymentMethod,
    lines,
    vat,
    texts,
    buyer,
    reverseCharge: lines.some(l => l.category === 'AE'),
    total: totals.gross || '0.00',
    rounding: totals.rounding || '0.00',
    payable: totals.payable || '0.00',
    paid
  };
}
