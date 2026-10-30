// A cash withdrawal or deposit matched with the cash book: the movement
// gets a cash voucher of the same amount (a receipt when cash came out of
// the account, an expense voucher when it went in), outside VAT and not a
// sale, in the cash book of its currency (one is created when there is
// none). A sole trader who keeps simple bookkeeping here also gets the
// transfer in the cash journal as priebežná položka. Undoing the match
// cancels the voucher and removes that entry.
import { abs, round } from '@we-invoice/core';
import { createCashBook, createVoucher } from '../cash/operations.js';

const keepsSimpleBooks = (company) => company && company.taxpayerType !== 'PO' && company.accountingMode === 'SIMPLE';

/**
 * @param {object} store
 * @param {string} txId
 * @param {{transfer: 'WITHDRAWAL'|'DEPOSIT'}} proposal
 * @param {{bookName: string, purpose: string}} labels  texts in the user's language
 * @returns {Promise<object>} the voucher
 */
export async function bookCashTransfer(store, txId, proposal, labels) {
  const tx = store.get('bankTransactions', txId);
  const amount = round(abs(tx.amount), 2);
  const kind = proposal.transfer === 'WITHDRAWAL' ? 'CASH_IN' : 'CASH_OUT';
  const book = store.list('cashBooks').find(b => (b.currency || 'EUR') === tx.currency)
    || await createCashBook(store, { name: labels.bookName, currency: tx.currency });
  const created = await createVoucher(store, { bookId: book.id, kind, date: tx.date, amount, purpose: labels.purpose, vat: 'O', ekasaSale: false });
  const voucher = await store.update('documents', created.id, { bankTxId: tx.id });
  if (keepsSimpleBooks(store.company())) {
    await store.insert('ledgerEntries', {
      date: tx.date, number: voucher.number, direction: 'TRANSFER', medium: kind === 'CASH_IN' ? 'BANK' : 'CASH', amount, vat: null,
      category: 'TRANSFER', taxRelevant: false, docId: voucher.id, text: labels.purpose, auto: false
    });
  }
  await store.update('bankTransactions', tx.id, { matched: { docId: voucher.id, confidence: 100, confirmed: true }, allocations: [] });
  return voucher;
}

/** The cash voucher a movement was matched with, or null. */
export function transferVoucher(tx, documents) {
  const doc = tx.matched?.confirmed ? documents.find(d => d.id === tx.matched.docId) : null;
  return doc && doc.bankTxId === tx.id && (doc.kind === 'CASH_IN' || doc.kind === 'CASH_OUT') ? doc : null;
}

/** Undoes a transfer: the voucher is cancelled, its journal entry removed, the movement open again. */
export async function undoCashTransfer(store, txId) {
  const tx = store.get('bankTransactions', txId);
  const voucher = transferVoucher(tx, store.list('documents'));
  if (voucher) {
    await store.update('documents', voucher.id, { status: 'CANCELLED' });
    for (const entry of store.list('ledgerEntries').filter(e => e.docId === voucher.id)) await store.remove('ledgerEntries', entry.id);
  }
  await store.update('bankTransactions', txId, { matched: null, allocations: [] });
}
