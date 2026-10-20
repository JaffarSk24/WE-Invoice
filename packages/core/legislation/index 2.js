// Legislation config with validity dates (05-accounting-tax.md § 5.1),
// WP-CORE. Rates, limits, deadlines and legal texts live only in the JSON
// files next to this one, never in logic. Every section is a list of
// entries with validFrom / validTo; getLegislation picks the entry valid
// on the date of the document or period.
import { CoreError } from '../errors.js';
import sk from './sk.json' with { type: 'json' };

export const LEGISLATION = Object.freeze({ SK: sk });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const META = new Set(['$comment', 'country']);

function country(code) {
  const data = LEGISLATION[String(code || 'SK').toUpperCase()];
  if (!data) throw new CoreError('LEGISLATION_COUNTRY_UNKNOWN', `no legislation for ${code}`);
  return data;
}

function section(data, name, code) {
  const entries = data[name];
  if (!Array.isArray(entries)) throw new CoreError('LEGISLATION_KEY_UNKNOWN', `unknown legislation key ${name} (${code})`);
  return entries;
}

function assertDate(date) {
  if (!DATE.test(String(date || ''))) throw new CoreError('DATE_INVALID', `expected YYYY-MM-DD, got ${date}`);
  return date;
}

/** True when an entry is in force on the date (validTo inclusive). */
export function validOn(entry, date) {
  return entry.validFrom <= date && (!entry.validTo || entry.validTo >= date);
}

function entriesOn(entries, date) {
  // Several entries may be valid on one date (one per code); the latest
  // validFrom wins among entries of the same code.
  const byCode = new Map();
  for (const entry of entries) {
    if (!validOn(entry, date)) continue;
    const key = entry.code ?? '';
    const current = byCode.get(key);
    if (!current || current.validFrom < entry.validFrom) byCode.set(key, entry);
  }
  return [...byCode.values()];
}

/**
 * Value of a key valid on a date.
 *   getLegislation('vatRates', date)            all rate entries valid on the date
 *   getLegislation('vatRates.STANDARD', date)   the entry with that code
 *   getLegislation('vatRates.STANDARD.rate', date)   "23"
 *   getLegislation('deadlines.invoiceIssueDays', date)   15
 *   getLegislation('texts.reverseCharge.sk', date)
 * Throws LEGISLATION_KEY_UNKNOWN for an unknown section and
 * LEGISLATION_NOT_IN_FORCE when nothing is valid on the date.
 * @param {string} key  dotted path in the country file
 * @param {string} date  YYYY-MM-DD
 * @param {string} [countryCode='SK']
 */
export function getLegislation(key, date, countryCode = 'SK') {
  const data = country(countryCode);
  assertDate(date);
  const [name, ...path] = String(key || '').split('.');
  const entries = entriesOn(section(data, name, countryCode), date);
  if (!entries.length) throw new CoreError('LEGISLATION_NOT_IN_FORCE', `${name} has no entry valid on ${date}`);
  const coded = entries.some(e => e.code !== undefined);
  let value;
  if (coded) {
    if (!path.length) return entries;
    const wanted = path.shift();
    value = entries.find(e => e.code === wanted);
    if (!value) throw new CoreError('LEGISLATION_NOT_IN_FORCE', `${name}.${wanted} is not valid on ${date}`);
  } else {
    value = entries[0];
  }
  for (const step of path) {
    if (value === null || typeof value !== 'object' || !(step in value)) {
      throw new CoreError('LEGISLATION_KEY_UNKNOWN', `unknown legislation path ${key}`);
    }
    value = value[step];
  }
  return value;
}

/**
 * Paths of values that are not yet verified against the source, such as
 * "vatRates/STANDARD/2025-01-01" or "deadlines/2014-01-01". Release CI
 * fails while the list is not empty.
 * @returns {string[]}
 */
export function unverifiedLegislation(countryCode = 'SK') {
  const data = country(countryCode);
  const out = [];
  for (const [name, entries] of Object.entries(data)) {
    if (META.has(name) || !Array.isArray(entries)) continue;
    entries.forEach(entry => {
      if (entry.verified === true) return;
      out.push([name, entry.code, entry.validFrom].filter(Boolean).join('/'));
    });
  }
  return out;
}

/** Allowed exemption reasons (VATEX code and the paragraph) of a VAT category on a date. */
export function exemptionReasonsOn(category, date, countryCode = 'SK') {
  const byCategory = getLegislation('exemptionReasons.byCategory', date, countryCode);
  return byCategory[category] || [];
}
