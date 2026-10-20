// Cash vouchers in the VAT records. A príjmový (CASH_IN) or výdavkový
// (CASH_OUT) pokladničný doklad written by hand for a sale or a purchase
// carries its own VAT and belongs to the evidencia DPH like a receipt: a
// receipt is a sale (OUT), an expense a purchase (IN) received on its own
// date. A voucher that only records the cash payment of an invoice
// (paysDocId) or has no VAT at all (category O) is left out: the invoice
// already carries the tax, and counting the voucher too would double it.
// A sales voucher of a company that uses eKasa is a sale the eKasa turnover
// already holds: it is shown apart and not added (isEkasaCoveredVoucher).
import { ekasaExempt } from '../payments/bank/ekasa-manual.js';
import { problem } from './problems.js';

export const CASH_VOUCHER_KINDS = Object.freeze(['CASH_IN', 'CASH_OUT']);

function categories(document) {
  const fromTotals = (document.totals && document.totals.breakdown) || [];
  const fromLines = (document.lines || []).filter(l => l && l.kind !== 'TEXT' && l.kind !== 'SUBTOTAL');
  return [...fromTotals.map(b => b.category), ...fromLines.map(l => l.vatCategory)].filter(Boolean);
}

/** True for a cash voucher that the VAT records must list. */
export function isTaxCashVoucher(document) {
  if (!document || !CASH_VOUCHER_KINDS.includes(document.kind)) return false;
  if (document.paysDocId) return false;
  return categories(document).some(c => c !== 'O');
}

// Reverse charge is invoiced between payers and never goes through eKasa.
const NOT_IN_EKASA = Object.freeze(['AE']);

/**
 * True for a sales voucher (CASH_IN) of a company that uses eKasa, marked
 * "predaj evidovaný v eKasa" (the default: only an explicit false clears it).
 * Its VAT reaches the kontrolný výkaz in D.1 through the eKasa turnover the
 * user enters separately, so the records list it apart and never add it.
 */
export function isEkasaCoveredVoucher(document, company) {
  return isTaxCashVoucher(document) && document.kind === 'CASH_IN' && !ekasaExempt(company) && document.ekasaSale !== false;
}

/** True when a VAT group of a covered voucher is in eKasa (every category but AE). */
export function isEkasaCoveredGroup(category) {
  return !NOT_IN_EKASA.includes(category);
}

// Days with eKasa turnover (sales receipts) among the documents.
function ekasaDays(documents) {
  return new Set((documents || [])
    .filter(d => d && !d.deleted && d.kind === 'SALES_RECEIPT' && !['DRAFT', 'CANCELLED'].includes(d.status))
    .map(d => d.taxDate || d.issueDate)
    .filter(Boolean));
}

/**
 * Warnings about cash sales and eKasa turnover on the same day: a voucher
 * counted in the records (not marked as in eKasa) next to eKasa turnover of
 * its day may be the same sale twice; a voucher marked as in eKasa on a
 * day without eKasa turnover has its VAT nowhere yet.
 * @param {Array<object>} entries  counted entries of the records
 * @param {Array<object>} covered  entries of vouchers marked as in eKasa
 * @param {Array<object>} documents
 */
export function voucherEkasaProblems(entries, covered, documents) {
  const days = ekasaDays(documents);
  const out = [];
  const doc = (e) => ({ id: e.docId, number: e.number, kind: e.kind });
  for (const e of entries) {
    if (e.kind === 'CASH_IN' && e.direction === 'OUT' && e.treatment !== 'DOMESTIC_RC' && days.has(e.date)) {
      out.push(problem('CASH_VOUCHER_EKASA_SAME_DAY', doc(e), { severity: 'warning', params: { date: e.date } }));
    }
  }
  for (const e of covered) {
    if (!days.has(e.date)) out.push(problem('CASH_VOUCHER_EKASA_MISSING', doc(e), { severity: 'warning', params: { date: e.date } }));
  }
  return out;
}
