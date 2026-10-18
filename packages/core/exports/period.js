// Which documents an export for a period contains, and the figures every
// export format reads from a document. A document belongs to the period of
// its tax date (dátum dodania), or of its issue date when it has none; a
// received document falls back to the date it was received. Drafts and
// deleted records never leave the app.
import { computeTotals } from '../vat/index.js';
import { getLegislation } from '../legislation/index.js';
import { sum, sub, round, cmp } from '../money/index.js';

export const SALES_KINDS = Object.freeze([
  'INVOICE', 'PROFORMA', 'ADVANCE_TAX_DOC', 'CREDIT_NOTE', 'DEBIT_NOTE', 'SELF_BILLING', 'SALES_RECEIPT'
]);
export const PURCHASE_KINDS = Object.freeze(['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT']);
export const ACCOUNTING_KINDS = Object.freeze([...SALES_KINDS, ...PURCHASE_KINDS]);

export function isPurchase(document) {
  return PURCHASE_KINDS.includes(document.kind);
}

/** The calendar date that places a document in a period. */
export function periodDate(document) {
  if (isPurchase(document)) return document.taxDate || document.receivedDate || document.issueDate || null;
  return document.taxDate || document.issueDate || null;
}

/**
 * Documents of a period, oldest first, then by number.
 * @param {Array<object>} documents
 * @param {{from: string, to: string, kinds?: string[], includeCancelled?: boolean}} filter
 */
export function selectDocuments(documents, { from, to, kinds = ACCOUNTING_KINDS, includeCancelled = true }) {
  return (documents || [])
    .filter(d => d && !d.deleted && d.status !== 'DRAFT' && kinds.includes(d.kind))
    .filter(d => includeCancelled || d.status !== 'CANCELLED')
    .filter(d => {
      const date = periodDate(d);
      return Boolean(date) && (!from || date >= from) && (!to || date <= to);
    })
    .sort((a, b) => periodDate(a).localeCompare(periodDate(b)) || String(a.number || '').localeCompare(String(b.number || '')));
}

/**
 * Totals of a document: computed from the lines when it has any, else the
 * stored totals (a document imported without lines keeps its sums).
 */
export function documentTotals(document) {
  if ((document.lines || []).length) {
    try {
      return computeTotals(document);
    } catch (e) {
      if (!document.totals) throw e;
    }
  }
  const t = document.totals || {};
  return {
    net: t.net || '0.00', vat: t.vat || '0.00', gross: t.gross || '0.00', payable: t.payable || t.gross || '0.00',
    prepaid: t.prepaid || '0.00', rounding: t.rounding || '0.00', breakdown: t.breakdown || [], lines: []
  };
}

/** Sum of the payments recorded on a document. */
export function paidTotal(document) {
  return round(sum((document.payments || []).map(p => p.amount)), 2);
}

/** Amount still to pay (negative when overpaid). */
export function openAmount(document, totals = documentTotals(document)) {
  return round(sub(totals.payable, paidTotal(document)), 2);
}

/**
 * Legislation code of a VAT rate on a date (STANDARD, REDUCED_1,
 * REDUCED_2), or null for a rate that is not in force then.
 */
export function rateCode(rate, date, country = 'SK') {
  if (rate === null || rate === undefined || rate === '') return null;
  let rates;
  try {
    rates = getLegislation('vatRates', date, country);
  } catch {
    return null;
  }
  const found = rates.find(r => cmp(r.rate, rate) === 0);
  return found ? found.code : null;
}

/**
 * The VAT breakdown grouped the way accounting programs want it: a base
 * and a VAT amount per legislation rate code, plus the base without VAT
 * (zero rated, exempt, reverse charge, outside the scope).
 * @returns {{none: string, STANDARD: {base, vat}, REDUCED_1: {base, vat}, REDUCED_2: {base, vat}, other: Array}}
 */
export function breakdownByCode(totals, date, country = 'SK') {
  const out = {
    none: '0.00',
    STANDARD: { base: '0.00', vat: '0.00' },
    REDUCED_1: { base: '0.00', vat: '0.00' },
    REDUCED_2: { base: '0.00', vat: '0.00' },
    other: []
  };
  for (const b of totals.breakdown || []) {
    const code = b.category === 'S' ? rateCode(b.rate, date, country) : null;
    if (code && out[code]) {
      out[code] = { base: round(sum([out[code].base, b.base]), 2), vat: round(sum([out[code].vat, b.vat]), 2) };
    } else if (b.category === 'S') {
      out.other.push(b);
    } else {
      out.none = round(sum([out.none, b.base]), 2);
    }
  }
  return out;
}
