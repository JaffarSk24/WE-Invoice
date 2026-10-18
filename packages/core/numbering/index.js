// Document numbering (03-features.md § 3.5), WP-CORE.
import { NotImplementedError } from '../errors.js';

/** Fills a mask such as "FA{YYYY}{N:4}". @param {string} mask @param {{date: string, counter: number}} ctx @returns {string} */
export function formatNumber(mask, ctx) { throw new NotImplementedError('formatNumber'); }

/**
 * Next free number of a series for a date. Does not mutate the series.
 * @param {import('../schema/types.js').Series} series
 * @param {{date: string, taken?: Iterable<string>}} ctx
 * @returns {{number: string, vs: string, counterKey: string, nextCounter: number}}
 */
export function nextNumber(series, ctx) { throw new NotImplementedError('nextNumber'); }

/** Variable symbol from a number: its digits, at most 10. @returns {string} */
export function vsFromNumber(number) { throw new NotImplementedError('vsFromNumber'); }

/**
 * Duplicates of seriesId + number after a merge, with the renumbering
 * proposal for unlocked documents (02-architecture.md § 2.6).
 * @returns {Array<{docId: string, number: string, proposed: string|null, locked: boolean}>}
 */
export function findNumberConflicts(documents, seriesList) { throw new NotImplementedError('findNumberConflicts'); }
