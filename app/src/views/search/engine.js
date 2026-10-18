// The search index of the open company, built once and rebuilt only after
// the data changes, so typing into the search answers from memory. The
// index lives in the core (searchIndex / searchQuery); this module owns
// the cache and where each result leads.
import { searchIndex, searchQuery } from '@we-invoice/core';
import { on } from '../../events.js';
import { reportData } from '../reports/data.js';

let cached = null;
let watching = false;

function invalidate() {
  cached = null;
}

function watch() {
  if (watching) return;
  watching = true;
  ['data:changed', 'company:switched', 'demo:enabled', 'demo:disabled', 'language:changed'].forEach(ev => on(ev, invalidate));
}

export function currentIndex() {
  watch();
  if (!cached) {
    const data = reportData();
    cached = searchIndex({ documents: data.documents, contacts: data.contacts, items: data.items });
  }
  return cached;
}

/** Results of a query over the open company. */
export function search(query, options = {}) {
  return searchQuery(currentIndex(), query, options);
}

// The list screen of each document kind (shell/nav.js routes).
const KIND_ROUTES = Object.freeze({
  INVOICE: 'invoices', ADVANCE_TAX_DOC: 'invoices', SALES_RECEIPT: 'invoices', SELF_BILLING: 'invoices',
  PROFORMA: 'proformas', CREDIT_NOTE: 'credit-notes', DEBIT_NOTE: 'credit-notes', QUOTE: 'quotes',
  ORDER_IN: 'orders', ORDER_OUT: 'orders', DELIVERY_NOTE: 'delivery-notes', REMINDER: 'reminders',
  CASH_IN: 'cash', CASH_OUT: 'cash', INTERNAL: 'cash',
  RECEIVED_INVOICE: 'received', RECEIVED_CREDIT_NOTE: 'received', EXPENSE_RECEIPT: 'expenses'
});

/** The route a search result opens: "<list>/<id>", e.g. "invoices/0193...". */
export function routeFor(result) {
  if (!result) return null;
  if (result.type === 'contact') return `contacts/${result.id}`;
  if (result.type === 'item') return `items/${result.id}`;
  const list = KIND_ROUTES[result.kind] || (result.type === 'received' ? 'received' : 'invoices');
  return `${list}/${result.id}`;
}

/** The route of a document by its kind and id. */
export function documentRoute(kind, id) {
  return routeFor({ type: 'document', kind, id });
}

// For tests.
export function resetSearchCache() {
  cached = null;
}
