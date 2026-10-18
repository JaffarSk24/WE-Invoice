// Checks of business identifiers (03-features.md § 3.3 AC), WP-CORE.
import { NotImplementedError } from '../errors.js';

/** IČO checksum (SK and CZ use the same mod-11 rule). @returns {boolean} */
export function isValidIco(ico) { throw new NotImplementedError('isValidIco'); }
/** Slovak DIČ: 10 digits, divisible by 11. @returns {boolean} */
export function isValidDic(dic) { throw new NotImplementedError('isValidDic'); }
/** IČ DPH / EU VAT id format by country. @returns {boolean} */
export function isValidVatId(vatId) { throw new NotImplementedError('isValidVatId'); }
/** IBAN mod-97. @returns {boolean} */
export function isValidIban(iban) { throw new NotImplementedError('isValidIban'); }
/** BIC of a Slovak or Czech bank from its code in the IBAN. @returns {string|null} */
export function bicFromIban(iban) { throw new NotImplementedError('bicFromIban'); }
