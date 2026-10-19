// The dashboard's data from the store (views/dashboard/data.js): the
// documents as flat summaries, the contacts, the company bank accounts and
// the number of received documents still to process. The dashboard shows
// the demo set itself in demo mode.
import { round, sum } from '@we-invoice/core';
import { hasStore, getStore } from '../../store/index.js';
import { todayLocal } from '../../components/dates.js';
import { documentRows, dashboardDocument } from './rows.js';

// The company accounts with the sum of their imported statement lines.
// There is no opening balance in the data yet (the bank package owns it),
// so the figure is the turnover of the imported statements.
export function accountsWithTurnover(company, transactions) {
  return (company.bankAccounts || []).map(a => ({
    id: a.id, name: a.name || a.iban, iban: a.iban, currency: a.currency || 'EUR',
    balance: round(sum((transactions || []).filter(tx => tx.accountId === a.id && (tx.currency || 'EUR') === (a.currency || 'EUR')).map(tx => tx.amount)), 2)
  }));
}

const INBOX_KINDS = new Set(['RECEIVED_INVOICE', 'RECEIVED_CREDIT_NOTE', 'EXPENSE_RECEIPT']);

export function dashboardSource(store = hasStore() ? getStore() : null) {
  const company = store ? store.company() : null;
  if (!company) return { documents: [], contacts: [], accounts: [], inboxCount: 0 };
  const contacts = store.list('contacts');
  const docs = store.list('documents');
  const rows = documentRows(docs, { contacts: new Map(contacts.map(c => [c.id, c])), company, today: todayLocal() });
  return {
    documents: rows.map(dashboardDocument),
    contacts,
    accounts: accountsWithTurnover(company, store.list('bankTransactions')),
    inboxCount: docs.filter(d => INBOX_KINDS.has(d.kind) && d.status === 'TO_PROCESS').length
  };
}
