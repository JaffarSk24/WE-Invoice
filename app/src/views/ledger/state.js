// Where the ledger screens read their data: the open company in the store,
// or the sample company in demo mode. In demo mode the automatic entries
// are computed in memory and nothing is written; the screens then show
// the bookkeeping as a SIMPLE company would see it.
import { planEntrySync, sum } from '@we-invoice/core';
import { getStore, hasStore } from '../../store/index.js';
import { isDemo, demoData } from '../shell/demo-mode.js';
import { currentCompany } from '../shell/company-state.js';
import { todayLocal } from '../../components/dates.js';

export const BOOKKEEPING_MODES = Object.freeze(['SIMPLE', 'TAX_RECORDS_FLAT']);

function storeOrNull() {
  return hasStore() ? getStore() : null;
}

/** The company the screens work for (demo, store or the shell copy). */
export function ledgerCompany() {
  if (isDemo()) return demoData().company;
  return storeOrNull()?.company() || currentCompany() || null;
}

/** Accounting mode as the screens treat it; demo is shown as SIMPLE. */
export function ledgerMode(company = ledgerCompany()) {
  if (!company) return null;
  if (isDemo()) return 'SIMPLE';
  if (company.taxpayerType === 'PO' && company.accountingMode !== 'NONE') return 'EXTERNAL';
  return company.accountingMode || 'NONE';
}

/** True when writing is refused: demo mode, a read-only file or no store. */
export function isReadOnly() {
  if (isDemo()) return true;
  const store = storeOrNull();
  return !store || store.readOnly || !store.company();
}

function list(name) {
  const store = storeOrNull();
  return store ? store.list(name) : [];
}

/** Everything the screens compute from, in one snapshot. */
export function ledgerData() {
  const company = ledgerCompany();
  if (isDemo()) {
    const demo = demoData();
    const documents = demo.documents || [];
    const entries = planEntrySync({ documents, entries: [], company: demo.company }).insert;
    return { company, documents, entries, assets: [], trips: [], bankTransactions: [], cashBooks: [] };
  }
  return {
    company,
    documents: list('documents'),
    entries: list('ledgerEntries'),
    assets: list('assets'),
    trips: list('trips'),
    bankTransactions: list('bankTransactions'),
    cashBooks: list('cashBooks')
  };
}

/** Records with tombstones, which the automatic sync needs for its ids. */
export function entriesWithTombstones() {
  const store = storeOrNull();
  return store ? store.list('ledgerEntries', { includeDeleted: true }) : [];
}

/** Balances before the first booked year: opening of the EUR cash books. */
export function initialBalances(data) {
  const cash = (data.cashBooks || []).filter(b => !b.currency || b.currency === 'EUR').map(b => b.openingBalance || '0');
  return { cash: sum(cash), bank: '0' };
}

/** Years to offer: this year back to the first year with data, newest first. */
export function ledgerYears(data, today = todayLocal()) {
  const current = Number(today.slice(0, 4));
  const dates = [...data.entries.map(e => e.date), ...data.assets.map(a => a.acquiredOn), ...data.trips.map(t => t.date)].filter(Boolean);
  const first = dates.length ? Math.min(...dates.map(d => Number(d.slice(0, 4)))) : current;
  const out = [];
  for (let y = current; y >= Math.min(first, current); y -= 1) out.push(y);
  return out;
}
