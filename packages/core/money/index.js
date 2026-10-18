// Money arithmetic on decimal strings (WP-CORE). Every amount in the app
// goes through these functions: big.js underneath, never float arithmetic.
// Rounding is half-up to 2 places unless stated (EN 16931).
import { NotImplementedError } from '../errors.js';

/** @param {string|number} a @param {string|number} b @returns {string} */
export function add(a, b) { throw new NotImplementedError('add'); }
/** @param {string|number} a @param {string|number} b @returns {string} */
export function sub(a, b) { throw new NotImplementedError('sub'); }
/** @param {string|number} a @param {string|number} b @returns {string} */
export function mul(a, b) { throw new NotImplementedError('mul'); }
/** @param {string|number} a @param {string|number} b @param {number} [places] @returns {string} */
export function div(a, b, places) { throw new NotImplementedError('div'); }
/** @param {string|number} a @param {string|number} b @returns {-1|0|1} */
export function cmp(a, b) { throw new NotImplementedError('cmp'); }
/** Half-up rounding. @param {string|number} value @param {number} [places=2] @returns {string} */
export function round(value, places = 2) { throw new NotImplementedError('round'); }
/** Cash rounding to 0.05 (SK rules). @param {string} amount @returns {{amount: string, rounding: string}} */
export function roundCash(amount) { throw new NotImplementedError('roundCash'); }
/** Display string through Intl. @param {string} amount @param {string} currency @param {string} locale @returns {string} */
export function formatAmount(amount, currency, locale) { throw new NotImplementedError('formatAmount'); }
/** Parses user input; accepts both "," and "." as decimal separator. @param {string} text @returns {string|null} */
export function parseAmount(text) { throw new NotImplementedError('parseAmount'); }
/** Converts an amount by a rate (document currency to EUR). @returns {string} */
export function convert(amount, rate, places = 2) { throw new NotImplementedError('convert'); }
