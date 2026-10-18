// Bank profiles of CSV statements (data in profiles.json): which profile a
// header belongs to, and which columns hold which field. A header no
// profile knows gets the generic name lists, so an unknown bank still
// imports when its columns have usual names; the user can override any
// column in the import dialog.
import data from './profiles.json' with { type: 'json' };
import { normalizeText } from '../text.js';
import { CoreError } from '../../../errors.js';

export const CSV_FIELDS = Object.freeze([
  'date', 'valueDate', 'amount', 'debit', 'credit', 'currency', 'counterpartyName', 'counterpartyAccount',
  'counterpartyBankCode', 'vs', 'ks', 'ss', 'symbols', 'message', 'ref', 'fee', 'state'
]);

export const BANK_PROFILES = Object.freeze(data.profiles.map(p => Object.freeze({ id: p.id, name: p.name, country: p.country })));
export const COMPLETED_STATES = Object.freeze(data.completedStates);

/** Header cell as profiles name it: no case, no diacritics, no leading "#". */
export function headerName(cell) {
  return normalizeText(cell).replace(/^#\s*/, '');
}

export function profileById(id) {
  const profile = data.profiles.find(p => p.id === id);
  if (!profile) throw new CoreError('BANK_PROFILE_UNKNOWN', `unknown bank profile ${id}`);
  return profile;
}

/** Ids of the profiles whose signature the header carries, best first. */
export function detectProfiles(header) {
  const names = new Set(header.map(headerName));
  return data.profiles
    .filter(p => p.signature.every(s => names.has(s)))
    .sort((a, b) => b.signature.length - a.signature.length)
    .map(p => p.id);
}

/** True when a row looks like the header of any known profile. */
export function isProfileHeader(row) {
  return detectProfiles(row).length > 0;
}

// Column indexes of one field: every header that carries one of the names,
// in the order of the names.
function indexesOf(names, header, taken) {
  const out = [];
  for (const name of names || []) {
    header.forEach((cell, i) => {
      if (cell === name && !out.includes(i) && !taken.has(i)) out.push(i);
    });
  }
  return out;
}

/**
 * Field -> column indexes for a header. `profileId` null or 'generic' uses
 * the generic name lists; `overrides` ({field: index}) wins over both.
 * A column is used by one field only, except the reference columns that
 * also carry symbols.
 * @returns {Record<string, number[]>}
 */
export function columnMapping(header, profileId = null, overrides = {}) {
  const names = header.map(headerName);
  const columns = profileId && profileId !== 'generic' ? profileById(profileId).columns : data.generic;
  const taken = new Set();
  const mapping = {};
  const fixed = Object.entries(overrides || {}).filter(([, i]) => Number.isInteger(i) && i >= 0);
  fixed.forEach(([, i]) => taken.add(i));
  for (const field of CSV_FIELDS) {
    const own = fixed.find(([f]) => f === field);
    if (own) { mapping[field] = [own[1]]; continue; }
    const shared = field === 'symbols' || field === 'ref' || field === 'message' || field === 'counterpartyName';
    mapping[field] = indexesOf(columns[field], names, shared ? new Set() : taken);
    if (!shared) mapping[field].forEach(i => taken.add(i));
  }
  if (mapping.amount.length) { mapping.debit = []; mapping.credit = []; }
  return mapping;
}

/** A mapping that can produce transactions: a date and an amount. */
export function mappingUsable(mapping) {
  return Boolean(mapping.date?.length && (mapping.amount?.length || mapping.debit?.length || mapping.credit?.length));
}
