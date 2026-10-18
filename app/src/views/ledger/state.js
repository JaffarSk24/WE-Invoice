// Where the ledger screens read their data: the open company in the store,
// or the sample company in demo mode. In demo mode the automatic entries
// are computed in memory and nothing is written; the screens then show
// the bookkeeping as a SIMPLE company would see it.
import { planEntrySync, sum, isZero } from '@we-invoice/core';
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

// The sample documents carry only their totals; the books need lines and
// payments, so each becomes one line at 23 % paid on its due date.
function demoDocument(d) {
  if (d.lines) return d;
  const party = { name: d.contactName || '' };
  const payments = d.paidAmount && !isZero(d.paidAmount)
    ? [{ id: `${d.id}-pay`, date: d.dueDate && d.dueDate < todayLocal() ? d.dueDate : d.issueDate, amount: d.paidAmount, method: 'TRANSFER', source: 'MANUAL' }]
    : [];
  return {
    ...d, buyer: party, seller: party, payments,
    lines: [{ id: `${d.id}-l`, name: '', qty: '1', unitPrice: d.totalNet, vatCategory: 'S', vatRate: '23', accountingCategory: d.kind === 'RECEIVED_INVOICE' ? 'EXPENSE_TAX_SERVICES' : null }]
  };
}

/** Everything the screens compute from, in one snapshot. */
export function ledgerData() {
  const company = ledgerCompany();
  if (isDemo()) {
    const demo = demoData();
    const documents = (demo.documents || []).map(demoDocument);
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
