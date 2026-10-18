// Document totals by EN 16931 (04-peppol.md § 4.4), WP-CORE. computeTotals()
// is the only place totals are computed: the editor, the PDF, UBL and every
// report call it, so they can never disagree.
import { NotImplementedError } from '../errors.js';

/**
 * @param {import('../schema/types.js').Document} document
 * @param {{prepaid?: string, cashRounding?: boolean}} [options]
 * @returns {import('../schema/types.js').Totals}
 */
export function computeTotals(document, options = {}) { throw new NotImplementedError('computeTotals'); }

/** Net amount of one line (BT-131), rounded to 2 places. @returns {string} */
export function lineNet(line) { throw new NotImplementedError('lineNet'); }

/** Unit price with VAT to unit price without, 4 places. @returns {string} */
export function grossToNet(price, rate) { throw new NotImplementedError('grossToNet'); }

/** VAT rates valid on a date, from legislation. @returns {Array<{code: string, rate: string}>} */
export function vatRatesOn(date, country = 'SK') { throw new NotImplementedError('vatRatesOn'); }
