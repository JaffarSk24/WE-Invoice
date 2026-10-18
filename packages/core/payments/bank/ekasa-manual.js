// eKasa stage 1 (12-risks § 12.3): help to issue the receipt by hand in
// the financial administration's virtual cash register (VRP2), with no
// integration of any kind: § 5 ods. 6 zákona 384/2025 forbids other client
// environments for VRP, so the app never calls, scripts or deep-links it.
// A cash, card or on-site QR payment of a sale is a tržba; for the payment
// of an invoice the receipt carries the invoice number and the amount but
// no items and no VAT breakdown (§ 8 ods. 2, § 9 ods. 2), so the VAT lines
// are offered only for a sale that is not an invoice (a sales receipt).
import { getLegislation } from '../../legislation/index.js';
import { round, abs, mul, div, sub, add, isZero } from '../../money/index.js';
import { computeTotals } from '../../vat/index.js';
import { cashLimitCheck, isBusinessParty } from './cash-rules.js';

export const EKASA_METHODS = Object.freeze(['CASH', 'CARD', 'QR_ON_SITE']);
const INVOICE_KINDS = new Set(['INVOICE', 'PROFORMA', 'ADVANCE_TAX_DOC', 'DEBIT_NOTE']);
const SALE_KINDS = new Set([...INVOICE_KINDS, 'SALES_RECEIPT']);

/** True when a payment of this document needs an eKasa receipt and the company uses eKasa. */
export function ekasaNeeded(document, payment, company) {
  if (!document || !payment || company?.usesEkasa === false) return false;
  return SALE_KINDS.has(document.kind) && EKASA_METHODS.includes(payment.method);
}

// VAT lines of a sale in the share the payment covers; the last line takes the rounding rest.
function vatLines(document, amount) {
  const totals = document.totals?.breakdown?.length ? document.totals : computeTotals(document);
  const payable = totals.payable || totals.gross;
  if (!payable || isZero(payable)) return [];
  const share = div(amount, abs(payable), 10);
  let left = round(amount, 2);
  return (totals.breakdown || []).map((b, i, list) => {
    const gross = i === list.length - 1 ? left : round(mul(add(b.base, b.vat), share), 2);
    left = round(sub(left, gross), 2);
    const vat = round(mul(b.vat, share), 2);
    return { category: b.category, rate: b.rate, gross, vat, base: round(sub(gross, vat), 2) };
  });
}

/**
 * What the user copies into VRP2 for one payment, plus the warnings.
 * @returns {{needed: boolean, invoicePayment: boolean, invoiceNumber: string|null, amount: string, currency: string,
 *   method: string, vrp2Url: string|null, vatLines: object[], cashLimit: object, law: string|null}}
 */
export function ekasaManualEntry(document, payment, company, contact = null) {
  const amount = round(abs(payment.amount), 2);
  const needed = ekasaNeeded(document, payment, company);
  let rule = null;
  try {
    rule = getLegislation('ekasa', payment.date);
  } catch (e) {
    console.warn('No eKasa rule on the payment date', e);
  }
  const invoicePayment = INVOICE_KINDS.has(document.kind);
  const party = contact || document.buyer;
  return {
    needed,
    invoicePayment,
    invoiceNumber: document.number || null,
    amount,
    currency: payment.currency || document.currency || 'EUR',
    method: payment.method,
    vrp2Url: rule?.vrp2Url || null,
    law: rule?.law || null,
    vatLines: invoicePayment ? [] : vatLines(document, amount),
    cashLimit: payment.method === 'CASH'
      ? cashLimitCheck({ amount, date: payment.date, currency: payment.currency || document.currency, fxRate: document.fxRate, document, b2b: isBusinessParty(party) })
      : { applies: false, exceeded: false, limit: null, total: null }
  };
}
