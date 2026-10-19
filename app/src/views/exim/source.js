// Where the export and import screens read from: the open company in the
// store, or the sample company in demo mode. The demo documents are
// summaries without lines, so they are turned into documents of the data
// model with one line at their own rate; in demo mode nothing is written.
import { round, div, mul, isZero } from '@we-invoice/core';
import { hasStore, getStore } from '../../store/index.js';
import { isDemo, demoData } from '../shell/demo-mode.js';
import { t } from '../../i18n/index.js';

function partyOfCompany(company) {
  return {
    name: company.name || '', ico: company.ico || null, dic: company.dic || null, icDph: company.icDph || null,
    address: company.address || {}, vatPayer: company.vatMode === 'PAYER'
  };
}

// One demo summary as a document with a single line.
export function demoDocument(doc, company, contacts) {
  const contact = contacts.find(c => c.id === doc.contactId) || { name: doc.contactName };
  const other = { contactId: contact.id || null, name: contact.name || '', ico: contact.ico || null, address: { city: contact.city || '', country: contact.country || 'SK' } };
  const own = partyOfCompany(company);
  const received = doc.kind === 'RECEIVED_INVOICE';
  const rate = isZero(doc.totalNet) ? '0' : round(mul(div(doc.totalVat, doc.totalNet, 6), '100'), 0);
  return {
    id: doc.id, createdAt: `${doc.issueDate}T08:00:00.000Z`, updatedAt: `${doc.issueDate}T08:00:00.000Z`, deleted: false,
    kind: doc.kind, number: doc.number, vs: (doc.number || '').replace(/\D/g, '').slice(0, 10) || null, status: doc.status,
    issueDate: doc.issueDate, taxDate: doc.issueDate, dueDate: doc.dueDate, currency: doc.currency || 'EUR',
    seller: received ? other : own, buyer: received ? own : other, contactId: contact.id || null, paymentMethod: 'TRANSFER',
    lines: [{ id: `${doc.id}-1`, kind: 'ITEM', name: t('exim.demo.line'), qty: '1', unit: { code: 'C62', label: '' }, unitPrice: doc.totalNet, priceType: 'NET', discountPct: null, vatCategory: 'S', vatRate: rate }],
    payments: isZero(doc.paidAmount || '0') ? [] : [{ id: `${doc.id}-p`, date: doc.dueDate || doc.issueDate, amount: doc.paidAmount, currency: doc.currency || 'EUR', method: 'TRANSFER', source: 'MANUAL' }],
    links: []
  };
}

/**
 * The data the screens work with.
 * @returns {{demo: boolean, writable: boolean, company: object|null, documents: object[], contacts: object[], items: object[], store: object|null}}
 */
export function eximSource() {
  if (isDemo()) {
    const demo = demoData();
    const contacts = demo.contacts.map(c => ({ ...c, billingAddress: { city: c.city || '', country: c.country || 'SK' } }));
    return {
      demo: true, writable: false, store: null, company: demo.company, contacts, items: [],
      documents: demo.documents.map(d => demoDocument(d, demo.company, demo.contacts))
    };
  }
  const store = hasStore() ? getStore() : null;
  const company = store ? store.company() : null;
  if (!store || !company) return { demo: false, writable: false, store, company: null, documents: [], contacts: [], items: [] };
  return {
    demo: false, writable: !store.readOnly, store, company,
    documents: store.list('documents'), contacts: store.list('contacts'), items: store.list('items')
  };
}
