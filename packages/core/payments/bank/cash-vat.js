// VAT of a cash voucher (príjmový or výdavkový pokladničný doklad) entered
// by hand: a rate of the standard category, reverse charge (AE, § 69 ods. 12
// zákona o DPH: the buyer pays the tax), an exemption (E) or no VAT (O,
// outside the scope). Rates and the legal references of AE and E come from
// legislation on the voucher date. Reverse charge between Slovak payers
// needs the partner's Slovak IČ DPH: the kontrolný výkaz lists every such
// voucher by it (A.2 for a sale, B.1 for a purchase).
import { vatRatesOn } from '../../vat/index.js';
import { exemptionReasonsOn } from '../../legislation/index.js';
import { isValidVatId } from '../../ids/index.js';
import { cmp } from '../../money/index.js';
import { CoreError } from '../../errors.js';

export const CASH_VAT_CATEGORIES = Object.freeze(['S', 'AE', 'E', 'O']);

/** True when the company charges and deducts VAT, so a voucher may carry it. */
export function cashVatAllowed(company) {
  return company?.vatMode === 'PAYER';
}

/**
 * The VAT choices of a voucher on a date: one per standard or reduced rate,
 * then AE, E and O. A company that is not a VAT payer gets only O.
 * @returns {Array<{value: string, category: string, rate: string|null}>}
 */
export function cashVatChoices(company, date) {
  const none = { value: 'O', category: 'O', rate: null };
  if (!cashVatAllowed(company)) return [none];
  const rates = [...new Set(vatRatesOn(date).map(r => r.rate))].sort((a, b) => cmp(b, a));
  return [
    ...rates.map(rate => ({ value: `S:${rate}`, category: 'S', rate })),
    { value: 'AE', category: 'AE', rate: null },
    { value: 'E', category: 'E', rate: null },
    none
  ];
}

// The legal reference of AE or E on the date, as the line stores it (BT-121, BT-120).
function reasonOf(category, date) {
  const [reason] = exemptionReasonsOn(category, date);
  return reason ? { code: reason.code, text: reason.law } : { code: null, text: null };
}

/**
 * The VAT fields of the voucher line for a choice ("S:23", "AE", "E", "O").
 * @returns {{vatCategory: string, vatRate: string|null, exemptionReasonCode: string|null, exemptionReasonText: string|null}}
 */
export function cashVatLine(value, date) {
  const [category, rate] = String(value || 'O').split(':');
  if (!CASH_VAT_CATEGORIES.includes(category)) throw new CoreError('VAT_CATEGORY_INVALID', `category ${category} is not offered on a cash voucher`);
  if (category === 'S') {
    if (!rate) throw new CoreError('VAT_RATE_REQUIRED', 'a standard category needs a rate');
    return { vatCategory: 'S', vatRate: rate, exemptionReasonCode: null, exemptionReasonText: null };
  }
  if (category === 'O') return { vatCategory: 'O', vatRate: null, exemptionReasonCode: null, exemptionReasonText: null };
  const reason = reasonOf(category, date);
  return { vatCategory: category, vatRate: category === 'E' ? '0' : null, exemptionReasonCode: reason.code, exemptionReasonText: reason.text };
}

/**
 * What stops a voucher of this category for this partner, as error codes
 * (errors.<code>): reverse charge needs a valid Slovak IČ DPH.
 * @returns {string[]}
 */
export function cashVatProblems(category, partner) {
  if (category !== 'AE') return [];
  const id = String(partner?.icDph || '').replace(/\s+/g, '').toUpperCase();
  if (!id) return ['CASH_AE_VAT_ID_MISSING'];
  if (!id.startsWith('SK')) return ['CASH_AE_NOT_DOMESTIC'];
  return isValidVatId(id) ? [] : ['CASH_AE_VAT_ID_INVALID'];
}
