// Where the reports, the search, the recycle bin and the change log read
// their records: the demo set in sample data mode (read only), otherwise
// the store of the open company. The demo documents are flat (totalNet,
// paidAmount...), so they are turned into the stored document shape the
// core reports expect.
import { isDemo, demoData } from '../shell/demo-mode.js';
import { hasStore, getStore } from '../../store/index.js';

const COLLECTIONS = ['documents', 'contacts', 'items', 'recurringTemplates', 'auditLog'];
const RECEIVED = new Set(['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT']);

/** A demo document in the stored shape: party snapshot, totals and payments. */
export function demoDocument(doc) {
  const party = { name: doc.contactName || '' };
  const paid = doc.paidAmount && Number(doc.paidAmount) !== 0
    ? [{ id: `${doc.id}-pay`, date: doc.status === 'PAID' ? doc.dueDate : doc.issueDate, amount: doc.paidAmount, method: 'TRANSFER', source: 'MANUAL', currency: doc.currency }]
    : [];
  return {
    ...doc,
    taxDate: doc.taxDate || doc.issueDate,
    [RECEIVED.has(doc.kind) ? 'seller' : 'buyer']: party,
    totals: { net: doc.totalNet, vat: doc.totalVat || '0', gross: doc.totalGross, payable: doc.totalGross },
    payments: paid,
    lines: doc.lines || [],
    tags: doc.tags || []
  };
}

function empty(demo) {
  return { documents: [], contacts: [], items: [], recurringTemplates: [], auditLog: [], demo, ready: false, readOnly: true };
}

/**
 * The records the reports work on.
 * @param {{includeDeleted?: boolean}} [options]
 * @returns {{documents: object[], contacts: object[], items: object[], recurringTemplates: object[], auditLog: object[], demo: boolean, ready: boolean, readOnly: boolean}}
 */
export function reportData({ includeDeleted = false } = {}) {
  if (isDemo()) {
    const demo = demoData();
    return { ...empty(true), documents: demo.documents.map(demoDocument), contacts: demo.contacts, ready: true };
  }
  if (!hasStore()) return empty(false);
  try {
    const store = getStore();
    if (!store.company()) return empty(false);
    const out = { demo: false, ready: true, readOnly: Boolean(store.readOnly) };
    COLLECTIONS.forEach(name => { out[name] = store.list(name, { includeDeleted }); });
    return out;
  } catch (e) {
    console.error('Report data could not be read', e);
    return empty(false);
  }
}

/** The store when records may be written: not in demo mode and not read only. */
export function writableStore() {
  if (isDemo() || !hasStore()) return null;
  const store = getStore();
  return store.company() && !store.readOnly ? store : null;
}
