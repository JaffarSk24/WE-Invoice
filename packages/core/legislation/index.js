// Legislation config with validity dates (05-accounting-tax.md § 5.1),
// WP-CORE. Rates, limits, deadlines and legal texts live only in the JSON
// files next to this one, never in logic.
import { NotImplementedError } from '../errors.js';
import sk from './sk.json' with { type: 'json' };

export const LEGISLATION = Object.freeze({ SK: sk });

/**
 * Value of a key valid on a date, e.g. get('vatRates', '2026-10-18').
 * @param {string} key  dotted path in the country file
 * @param {string} date  YYYY-MM-DD
 * @param {string} [country='SK']
 */
export function getLegislation(key, date, country = 'SK') { throw new NotImplementedError('getLegislation'); }

/** Paths of values that are not yet verified against the source. @returns {string[]} */
export function unverifiedLegislation(country = 'SK') { throw new NotImplementedError('unverifiedLegislation'); }
