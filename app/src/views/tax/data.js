// Data of the tax screens: the open company, its documents and audit log
// from the store, or the sample data in demo mode (adapted to the shape
// the VAT records read), the period the user looks at (kept per device),
// and the route of a document so a problem or a row can link to it.
import { taxPeriodOf, previousTaxPeriod, isTaxPeriod } from '@we-invoice/core';
import { hasStore, getStore } from '../../store/index.js';
import { currentCompany } from '../shell/company-state.js';
import { isDemo, demoData } from '../shell/demo-mode.js';
import { getPrefs, setPref } from '../../prefs.js';
import { todayLocal } from '../../components/dates.js';

// Synthetic, checksum-valid Slovak VAT ids for the sample contacts.
const DEMO_VAT_BASE = 2020123457;

function demoParty(name, i) {
  return { name, ico: String(10000001 + i * 7), icDph: `SK${DEMO_VAT_BASE + i * 11}`, address: { country: 'SK' }, vatPayer: true };
}

// The sample documents carry only their sums; the records need VAT groups,
// dates and parties.
export function demoTaxDocuments(demo) {
  const contacts = demo.contacts || [];
  return (demo.documents || []).map(d => {
    const i = Math.max(0, contacts.findIndex(c => c.id === d.contactId));
    const partner = demoParty(d.contactName || '', i);
    const received = d.kind === 'RECEIVED_INVOICE';
    const me = { name: demo.company.name, icDph: demo.company.icDph, address: demo.company.address, vatPayer: true };
    return {
      id: d.id, kind: d.kind, status: d.status, number: d.number, currency: 'EUR',
      issueDate: d.issueDate, taxDate: d.issueDate, receivedDate: received ? d.issueDate : null,
      seller: received ? partner : me, buyer: received ? me : partner,
      lines: [{ id: `${d.id}-1`, kind: 'ITEM', name: '', qty: '1', unitPrice: d.totalNet, vatRate: '23', vatCategory: 'S' }],
      totals: { net: d.totalNet, vat: d.totalVat, gross: d.totalGross, payable: d.totalGross, breakdown: [{ category: 'S', rate: '23', base: d.totalNet, vat: d.totalVat }] },
      payments: [], links: [], updatedAt: '2026-01-01T00:00:00.000Z'
    };
  });
}

/**
 * What the tax screens work with.
 * @returns {{company: object|null, documents: Array, auditLog: Array, demo: boolean, readOnly: boolean, store: object|null}}
 */
export function taxSource() {
  if (isDemo()) {
    const demo = demoData();
    return { company: demo.company, documents: demoTaxDocuments(demo), auditLog: [], demo: true, readOnly: true, store: null };
  }
  const company = currentCompany();
  if (!hasStore()) return { company, documents: [], auditLog: [], demo: false, readOnly: true, store: null };
  const store = getStore();
  const own = store.company();
  if (!own || (company && own.id !== company.id)) return { company, documents: [], auditLog: [], demo: false, readOnly: true, store: null };
  return {
    company: own,
    documents: store.list('documents'),
    auditLog: store.list('auditLog'),
    demo: false,
    readOnly: Boolean(store.readOnly),
    store
  };
}

/** The period to show first: the one remembered, else the last finished one. */
export function defaultPeriod(company, today = todayLocal()) {
  const kind = company && company.vatPeriod === 'QUARTER' ? 'QUARTER' : 'MONTH';
  const saved = (getPrefs().taxPeriods || {})[company ? company.id : ''];
  if (saved && isTaxPeriod(saved) && (kind === 'QUARTER') === saved.includes('Q')) return saved;
  return previousTaxPeriod(taxPeriodOf(today, kind));
}

export function rememberPeriod(company, period) {
  const all = { ...(getPrefs().taxPeriods || {}) };
  all[company ? company.id : ''] = period;
  setPref('taxPeriods', all);
}

// Screens of the document kinds (routes in views/shell/nav.js), the same
// as the search and reports use (views/search/engine.js).
const DOCUMENT_ROUTES = Object.freeze({
  INVOICE: 'invoices', ADVANCE_TAX_DOC: 'invoices', SELF_BILLING: 'invoices', CREDIT_NOTE: 'credit-notes', DEBIT_NOTE: 'credit-notes',
  SALES_RECEIPT: 'invoices', RECEIVED_INVOICE: 'received', RECEIVED_CREDIT_NOTE: 'received', EXPENSE_RECEIPT: 'expenses'
});

/** Hash of the screen of a document, "#/invoices/<id>", or null. */
export function documentHref(kind, id) {
  const route = DOCUMENT_ROUTES[kind];
  return route && id ? `#/${route}/${encodeURIComponent(id)}` : null;
}
