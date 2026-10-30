// @vitest-environment happy-dom
// Bank statements as files and the cash they move: stored lines shown
// readable, cash withdrawals booked with the cash book, several
// statements at once.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createStore, memoryAdapter } from '../../store/index.js';
import { resetPrefsCache } from '../../prefs.js';
import { matchBankTx, withImportKeys } from '@we-invoice/core';
import { readBatch, storeBatch } from './bank/import-batch.js';
import { bookCashTransfer, undoCashTransfer } from './bank/cash-transfer.js';
import { openImportDialog } from './bank/import-dialog.js';
import { t } from '../../i18n/index.js';
import { moneyState, shownTransactions } from './shared/data.js';

const ACCOUNT = { id: 'acc', name: 'Tatra', iban: 'SK3911000000002900123456', bic: 'TATRSKBX', currency: 'EUR', isDefault: true };
const invoice = (fields = {}) => ({
  kind: 'INVOICE', status: 'ISSUED', number: 'FA20260001', vs: '20260001', currency: 'EUR', issueDate: '2026-09-20', dueDate: '2026-10-04',
  buyer: { name: 'Alfa s.r.o.' }, lines: [], payments: [], totals: { net: '100.00', vat: '0.00', gross: '100.00', payable: '100.00' }, ...fields
});

async function freshStore() {
  const store = createStore({ adapter: memoryAdapter(), emitter: () => {} });
  await store.open();
  await store.createCompany({ name: 'Vzorova firma', bankAccounts: [ACCOUNT], series: [], vatMode: 'NONPAYER' });
  return store;
}

const ctx = { transport: { files: {} }, t: (k) => k, showError: () => {} };

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); resetPrefsCache(); });

describe('stored bank lines', () => {
  it('show the narrative of Tatra banka markup and leave out unmatched zero lines', () => {
    const list = shownTransactions([
      { id: 'a', amount: '-1.60', message: '<NtryInf Ctg="CA_252" Ini="P00" BkCh="TXA" Mthd="O"><Nrtv>Transakčná daň 05.10.2026</Nrtv></NtryInf>' },
      { id: 'b', amount: '0.00', message: 'Poplatok za balík', matched: null },
      { id: 'c', amount: '-36.90', message: 'Sluzby uctovnictva' }
    ]);
    expect(list.map(tx => [tx.id, tx.message])).toEqual([['a', 'Transakčná daň 05.10.2026'], ['c', 'Sluzby uctovnictva']]);
  });
});

describe('cash moved between bank and cash book', () => {
  it('books a withdrawal as a cash receipt outside VAT, and undoes it', async () => {
    const store = await freshStore();
    const [tx] = withImportKeys(ACCOUNT.id, [{ date: '2026-10-05', amount: '-200.00', currency: 'EUR', message: 'Výber z bankomatu, Bratislava', counterpartyName: 'TB Lamac', ref: 'atm1' }]);
    const saved = await store.insert('bankTransactions', { ...tx, matched: null });
    const [proposal] = matchBankTx(saved, store.list('documents'));
    expect(proposal).toMatchObject({ kind: 'CASH_TRANSFER', transfer: 'WITHDRAWAL' });
    const voucher = await bookCashTransfer(store, saved.id, proposal, { bookName: 'Hlavna', purpose: 'Výber hotovosti' });
    expect(voucher).toMatchObject({ kind: 'CASH_IN', bankTxId: saved.id, ekasaSale: false, totals: expect.objectContaining({ gross: '200.00' }) });
    expect(voucher.lines[0].vatCategory).toBe('O');
    expect(store.list('cashBooks')).toHaveLength(1);
    expect(store.get('bankTransactions', saved.id).matched).toMatchObject({ docId: voucher.id, confirmed: true });
    expect(moneyState().bankTransactions[0].counterpartyName).toBe('TB Lamac');
    await undoCashTransfer(store, saved.id);
    expect(store.get('documents', voucher.id).status).toBe('CANCELLED');
    expect(store.get('bankTransactions', saved.id).matched).toBe(null);
  });

  it('puts the transfer into the cash journal of a sole trader with simple bookkeeping', async () => {
    const store = await freshStore();
    await store.updateCompany({ taxpayerType: 'FO', accountingMode: 'SIMPLE' });
    const [tx] = withImportKeys(ACCOUNT.id, [{ date: '2026-10-06', amount: '500.00', currency: 'EUR', message: 'Vklad hotovosti cez bankomat', ref: 'dep1' }]);
    const saved = await store.insert('bankTransactions', { ...tx, matched: null });
    const voucher = await bookCashTransfer(store, saved.id, { transfer: 'DEPOSIT' }, { bookName: 'Hlavna', purpose: 'Vklad' });
    expect(voucher.kind).toBe('CASH_OUT');
    expect(store.list('ledgerEntries')).toEqual([expect.objectContaining({ direction: 'TRANSFER', medium: 'CASH', amount: '500.00', category: 'TRANSFER', docId: voucher.id })]);
    await undoCashTransfer(store, saved.id);
    expect(store.list('ledgerEntries')).toEqual([]);
  });

  it('shows the party of the matched document when the line names none', async () => {
    const store = await freshStore();
    const doc = await store.insert('documents', invoice({ kind: 'RECEIVED_INVOICE', status: 'PROCESSED', seller: { name: 'Seyfor Slovensko, a.s.' }, buyer: null }));
    const [tx] = withImportKeys(ACCOUNT.id, [{ date: '2026-09-03', amount: '-100.00', currency: 'EUR', message: 'POS nákup', ref: 'pos1' }]);
    const saved = await store.insert('bankTransactions', { ...tx, matched: { docId: doc.id, confidence: 100, confirmed: true } });
    expect(moneyState().bankTransactions.find(x => x.id === saved.id).counterpartyName).toBe('Seyfor Slovensko, a.s.');
  });
});

describe('several statements at once', () => {
  // Tests run from the repository root.
  const fixture = (name) => readFileSync(`tests/fixtures/bank/${name}`);
  const file = (name, bytes) => ({ name, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

  it('reads every file, stores an overlapping movement once and leaves out what it cannot read', async () => {
    const store = await freshStore();
    const csv = fixture('csv/365bank.csv');
    const rows = await readBatch([file('a.csv', csv), file('copy.csv', csv), file('broken.csv', new TextEncoder().encode('nothing here'))],
      { accounts: [ACCOUNT], existing: [], accountId: ACCOUNT.id });
    expect(rows[0].fresh.length).toBeGreaterThan(0);
    expect(rows[1]).toMatchObject({ fresh: [], duplicates: expect.any(Array) });
    expect(rows[1].duplicates).toHaveLength(rows[0].fresh.length);
    expect(rows[2].problem).toBeTruthy();
    const ids = await storeBatch(store, rows);
    expect(ids).toHaveLength(rows[0].fresh.length);
    expect(new Set(store.list('bankTransactions').map(tx => tx.importId)).size).toBe(1);
  });

  it('opens a place to drop statements on', async () => {
    await freshStore();
    openImportDialog(ctx);
    expect(document.querySelector('.modal-content .file-drop input[type="file"]').multiple).toBe(true);
    expect(document.querySelector('.modal-content .file-drop h3').textContent).toBe(t('bank.import.drop.title'));
  });
});
