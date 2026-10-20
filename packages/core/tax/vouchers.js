// Cash vouchers in the VAT records. A príjmový (CASH_IN) or výdavkový
// (CASH_OUT) pokladničný doklad written by hand for a sale or a purchase
// carries its own VAT and belongs to the evidencia DPH like a receipt: a
// receipt is a sale (OUT), an expense a purchase (IN) received on its own
// date. A voucher that only records the cash payment of an invoice
// (paysDocId) or has no VAT at all (category O) is left out: the invoice
// already carries the tax, and counting the voucher too would double it.
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
