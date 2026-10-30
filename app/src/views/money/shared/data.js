// What the money screens read: the open company and its collections from
// the store, or the sample data in demo mode. Demo documents are summary
// records (totalGross, paidAmount); they are shaped here like stored
// documents, so the core functions read both the same way. Bank lines and
// cash books do not exist in the demo: those screens show their empty state.
// Bank lines stored before the CAMT reader learnt Tatra banka's markup are
// shown with its narrative only, and empty zero lines (a free fee package)
// are left out.
import { narrative, isZero } from '@we-invoice/core';
import { hasStore, getStore } from '../../../store/index.js';
import { isDemo, demoData } from '../../shell/demo-mode.js';

const RECEIVED = new Set(['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT']);

/** Bank lines as the screens show them: readable messages, no unmatched zero lines. */
export function shownTransactions(list) {
  return list
    .filter(tx => !(isZero(tx.amount || '0') && !tx.matched?.confirmed))
    .map(tx => (tx.message && tx.message.includes('<NtryInf') ? { ...tx, message: narrative(tx.message) } : tx));
}

/** A demo summary record as a document with totals and payments. */
export function demoDocument(d) {
  const party = { name: d.contactName || '' };
  const paid = d.paidAmount && Number(d.paidAmount) !== 0;
  return {
    ...d,
    vs: String(d.number || '').replace(/\D/g, '').slice(-10) || null,
    buyer: RECEIVED.has(d.kind) ? null : party,
    seller: RECEIVED.has(d.kind) ? party : null,
    lines: [],
    totals: { net: d.totalNet, vat: d.totalVat, gross: d.totalGross, payable: d.totalGross },
    payments: paid ? [{ id: `${d.id}-pay`, date: d.dueDate || d.issueDate, amount: d.paidAmount, currency: d.currency, method: 'TRANSFER', source: 'MANUAL' }] : []
  };
}

/**
 * @returns {{demo: boolean, ready: boolean, readOnly: boolean, company: object|null, documents: object[], contacts: object[],
 *   bankTransactions: object[], cashBooks: object[]}}
 */
export function moneyState() {
  if (isDemo()) {
    const demo = demoData();
    return {
      demo: true, ready: true, readOnly: true, company: demo.company, documents: demo.documents.map(demoDocument),
      contacts: demo.contacts, bankTransactions: [], cashBooks: []
    };
  }
  const store = hasStore() ? getStore() : null;
  const company = store ? store.company() : null;
  if (!store || !company) {
    return { demo: false, ready: false, readOnly: true, company: null, documents: [], contacts: [], bankTransactions: [], cashBooks: [] };
  }
  return {
    demo: false, ready: true, readOnly: Boolean(store.readOnly), company,
    documents: store.list('documents'), contacts: store.list('contacts'),
    bankTransactions: shownTransactions(store.list('bankTransactions')), cashBooks: store.list('cashBooks')
  };
}

/** Contacts by id. */
export function contactMap(state) {
  return new Map(state.contacts.map(c => [c.id, c]));
}
