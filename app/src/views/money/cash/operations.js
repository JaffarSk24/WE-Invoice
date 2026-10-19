// Writes of the cash desk: a new cash book gets its two numbering series
// (receipts and expenses) in the company settings; a voucher takes the next
// number of its series and moves the counter; cancelling a voucher that
// paid a document takes that payment off the document too.
import { defaultCashSeries, buildCashVoucher, removePayments } from '@we-invoice/core';

function seriesList(store) {
  return (store.company()?.series || []).slice();
}

export async function createCashBook(store, { name, currency = 'EUR', openingBalance = '0', allowNegative = false }) {
  const index = store.list('cashBooks').length;
  const seriesIn = defaultCashSeries('CASH_IN', index);
  const seriesOut = defaultCashSeries('CASH_OUT', index);
  await store.updateCompany({ series: [...seriesList(store), seriesIn, seriesOut] });
  return store.insert('cashBooks', { name, currency, openingBalance, allowNegative, seriesInId: seriesIn.id, seriesOutId: seriesOut.id, kind: 'CASH' });
}

// The series of a book for a voucher kind; a book without one gets it now.
async function bookSeries(store, book, kind) {
  const field = kind === 'CASH_IN' ? 'seriesInId' : 'seriesOutId';
  const found = seriesList(store).find(s => s.id === book[field]);
  if (found) return found;
  const created = defaultCashSeries(kind, store.list('cashBooks').findIndex(b => b.id === book.id));
  await store.updateCompany({ series: [...seriesList(store), created] });
  await store.update('cashBooks', book.id, { [field]: created.id });
  return created;
}

/**
 * Stores a voucher. @param {{bookId: string, kind: string, date: string, amount: string, purpose: string,
 *   partner?: object|null, contactId?: string|null, vatRate?: string|null, paysDocId?: string|null, paymentId?: string|null}} input
 */
export async function createVoucher(store, input) {
  const book = store.get('cashBooks', input.bookId);
  const series = await bookSeries(store, book, input.kind);
  const taken = store.list('documents', { includeDeleted: true }).filter(d => d.seriesId === series.id).map(d => d.number);
  const { voucher, series: next } = buildCashVoucher({ ...input, book, series, taken });
  const saved = await store.insert('documents', voucher);
  await store.updateCompany({ series: seriesList(store).map(s => (s.id === next.id ? next : s)) });
  return saved;
}

export async function cancelVoucher(store, voucherId) {
  const voucher = store.get('documents', voucherId);
  await store.update('documents', voucherId, { status: 'CANCELLED' });
  if (voucher.paysDocId && voucher.paymentId) {
    const doc = store.get('documents', voucher.paysDocId);
    if (doc) await store.update('documents', doc.id, removePayments(doc, p => p.id === voucher.paymentId));
  }
}
