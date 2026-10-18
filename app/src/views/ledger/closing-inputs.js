// What the user enters at the year closing (counted cash, the bank
// statement balance, inventory, stamps, other assets, loans, other
// liabilities) and whether the year was closed. Kept on the device per
// company and year: the values are working notes for the wizard, the
// books themselves stay in the synced data.
import { getPrefs, setPref } from '../../prefs.js';

export const CLOSING_INPUTS = Object.freeze(['cashCount', 'bankStatement', 'inventory', 'stamps', 'otherAssets', 'loans', 'otherLiabilities']);

function all() {
  const saved = getPrefs().ledgerClosing;
  return saved && typeof saved === 'object' ? saved : {};
}

/** @returns {{inputs: object, closedAt: string|null}} */
export function closingState(companyId, year) {
  const entry = all()[companyId]?.[year] || {};
  const inputs = {};
  CLOSING_INPUTS.forEach(k => { if (entry.inputs?.[k] !== undefined && entry.inputs[k] !== null) inputs[k] = entry.inputs[k]; });
  return { inputs, closedAt: entry.closedAt || null };
}

export function saveClosingState(companyId, year, patch) {
  const saved = all();
  const company = { ...(saved[companyId] || {}) };
  company[year] = { ...closingState(companyId, year), ...company[year], ...patch };
  setPref('ledgerClosing', { ...saved, [companyId]: company });
  return closingState(companyId, year);
}
