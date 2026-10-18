// The cash desk: vouchers and their numbering, balances, the
// pokladničná kniha and its CSV, the negative balance warning, the B2B
// cash limit, offsets between receivables and payables, the eKasa
// stage 1 data and the flat payment list.
import { describe, it, expect } from 'vitest';
import * as core from '../../index.js';
import {
  defaultCashSeries, buildCashVoucher, cashBalance, cashBookRows, checkCashOut, cashKindForPayment, cashDifference,
  cashLimitCheck, cashBookCsv, planOffset, buildOffset, cancelOffset, offsetCandidates, ekasaManualEntry, ekasaNeeded, listPayments
} from './index.js';
import { paymentState } from '../index.js';

const BOOK = { id: 'b1', name: 'Hlavná pokladnica', currency: 'EUR', openingBalance: '100.00', allowNegative: false };

function vouchers() {
  let series = defaultCashSeries('CASH_IN');
  let out = defaultCashSeries('CASH_OUT');
  const docs = [];
  const add = (kind, date, amount, purpose) => {
    const s = kind === 'CASH_IN' ? series : out;
    const r = buildCashVoucher({ book: BOOK, kind, date, amount, purpose, series: s, partner: { name: 'Jan' } });
    if (kind === 'CASH_IN') series = r.series; else out = r.series;
    docs.push(r.voucher);
    return r.voucher;
  };
  add('CASH_IN', '2026-10-01', '50.00', 'Predaj');
  add('CASH_OUT', '2026-10-02', '30.00', 'Kancelarske potreby');
  add('CASH_IN', '2026-10-05', '20.00', 'Uhrada FA1');
  return docs;
}

describe('cash vouchers and the cash book', () => {
  it('numbers receipts and expenses in their own series by year', () => {
    const docs = vouchers();
    expect(docs.map(d => d.number)).toEqual(['PPD20260001', 'VPD20260001', 'PPD20260002']);
    expect(docs[0]).toMatchObject({ kind: 'CASH_IN', status: 'ISSUED', cashBookId: 'b1', issueDate: '2026-10-01', currency: 'EUR' });
    expect(docs[0].totals.payable).toBe('50.00');
    expect(defaultCashSeries('CASH_OUT', 1).mask).toBe('VPD2-{YYYY}{N:4}');
  });

  it('a voucher with a VAT rate splits the amount', () => {
    const { voucher } = buildCashVoucher({ book: BOOK, kind: 'CASH_OUT', date: '2026-10-01', amount: '12.30', purpose: 'x', vatRate: '23', series: defaultCashSeries('CASH_OUT') });
    expect(voucher.totals).toMatchObject({ net: '10.00', vat: '2.30', payable: '12.30' });
  });

  it('keeps the balance and the running balance of the book', () => {
    const docs = vouchers();
    expect(cashBalance(BOOK, docs)).toBe('140.00');
    expect(cashBalance(BOOK, docs, '2026-10-02')).toBe('120.00');
    const book = cashBookRows(BOOK, docs, { from: '2026-10-02', to: '2026-10-31' });
    expect(book.opening).toBe('150.00');
    expect(book.rows.map(r => r.balance)).toEqual(['120.00', '140.00']);
    expect(book).toMatchObject({ income: '20.00', expense: '30.00', closing: '140.00' });
    expect(cashDifference(BOOK, docs, '145.00', '2026-10-31')).toBe('5.00');
  });

  it('cancelled and deleted vouchers do not count', () => {
    const docs = vouchers();
    docs[0].status = 'CANCELLED';
    docs[2].deleted = true;
    expect(cashBalance(BOOK, docs)).toBe('70.00');
  });

  it('warns before an expense takes the balance below zero, now or later', () => {
    const docs = vouchers();
    expect(checkCashOut(BOOK, docs, { date: '2026-10-06', amount: '140.00' })).toEqual({ negative: false, lowest: '0.00' });
    expect(checkCashOut(BOOK, docs, { date: '2026-10-06', amount: '140.01' }).negative).toBe(true);
    expect(checkCashOut(BOOK, docs, { date: '2026-10-01', amount: '125.00' })).toEqual({ negative: true, lowest: '-5.00' });
    expect(checkCashOut({ ...BOOK, allowNegative: true }, docs, { date: '2026-10-01', amount: '500' }).negative).toBe(false);
  });

  it('exports the book as CSV for Slovak Excel', () => {
    const csv = cashBookCsv(cashBookRows(BOOK, vouchers()), {
      date: 'Datum', number: 'Cislo', kind: 'Druh', partner: 'Partner', purpose: 'Ucel', income: 'Prijem', expense: 'Vydaj',
      balance: 'Zostatok', opening: 'Pociatocny stav', closing: 'Spolu', kindIn: 'PPD', kindOut: 'VPD'
    });
    const lines = csv.slice(1).trim().split('\r\n');
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toBe('Datum;Cislo;Druh;Partner;Ucel;Prijem;Vydaj;Zostatok');
    expect(lines[1]).toBe(';;;;Pociatocny stav;;;100,00');
    expect(lines[2]).toBe('2026-10-01;PPD20260001;PPD;Jan;Predaj;50,00;;150,00');
    expect(lines[4]).toBe('2026-10-05;PPD20260002;PPD;Jan;Uhrada FA1;20,00;;140,00');
    expect(lines[5]).toBe(';;;;Spolu;70,00;30,00;140,00');
  });

  it('a cash payment of our invoice is a receipt, of a received one an expense', () => {
    expect(cashKindForPayment({ kind: 'INVOICE' })).toBe('CASH_IN');
    expect(cashKindForPayment({ kind: 'RECEIVED_INVOICE' })).toBe('CASH_OUT');
    expect(cashKindForPayment({ kind: 'CREDIT_NOTE' })).toBe('CASH_OUT');
  });
});

describe('B2B cash limit', () => {
  it('applies between businesses only and counts earlier cash on the document', () => {
    expect(cashLimitCheck({ amount: '6000', date: '2026-10-01', b2b: false }).applies).toBe(false);
    expect(cashLimitCheck({ amount: '5000', date: '2026-10-01', b2b: true })).toEqual({ applies: true, exceeded: false, limit: '5000.00', total: '5000.00' });
    const document = { payments: [{ amount: '3000.00', method: 'CASH' }, { amount: '9000.00', method: 'TRANSFER' }] };
    expect(cashLimitCheck({ amount: '2000.01', date: '2026-10-01', b2b: true, document }).exceeded).toBe(true);
  });

  it('converts another currency by the document rate, or says it cannot tell', () => {
    expect(cashLimitCheck({ amount: '130000', currency: 'CZK', fxRate: '25', date: '2026-10-01', b2b: true })).toMatchObject({ exceeded: true, total: '5200.00' });
    expect(cashLimitCheck({ amount: '1', currency: 'CZK', date: '2026-10-01', b2b: true }).exceeded).toBeNull();
  });
});

const invoice = (id, kind, payable, fields = {}) => ({
  id, kind, status: kind.startsWith('RECEIVED') ? 'PROCESSED' : 'ISSUED', currency: 'EUR', contactId: 'c1', number: id, lines: [], payments: [],
  totals: { net: payable, vat: '0', gross: payable, payable }, ...fields
});

describe('offset (zápočet)', () => {
  const docs = [
    invoice('FA1', 'INVOICE', '300.00', { dueDate: '2026-09-01' }),
    invoice('FA2', 'INVOICE', '200.00', { dueDate: '2026-09-15' }),
    invoice('PF1', 'RECEIVED_INVOICE', '450.00', { dueDate: '2026-09-10', seller: { name: 'Alfa' } }),
    invoice('FA9', 'INVOICE', '999.00', { contactId: 'c2' })
  ];

  it('finds both sides of one contact and the largest possible amount', () => {
    const c = offsetCandidates(docs, 'c1');
    expect(c.receivables.map(x => x.doc.id)).toEqual(['FA1', 'FA2']);
    expect(c.payables.map(x => x.doc.id)).toEqual(['PF1']);
    expect(c).toMatchObject({ receivable: '500.00', payable: '450.00', possible: '450.00' });
  });

  it('records OFFSET payments on both sides and a numbered protocol', () => {
    const plan = planOffset(docs, { contactId: 'c1' });
    expect(plan.receivables).toEqual([{ docId: 'FA1', amount: '300.00' }, { docId: 'FA2', amount: '150.00' }]);
    expect(plan.payables).toEqual([{ docId: 'PF1', amount: '450.00' }]);
    const result = buildOffset(docs, { plan, date: '2026-10-10', contact: { id: 'c1', name: 'Alfa' }, id: 'off-1' });
    expect(result.protocol).toMatchObject({ id: 'off-1', kind: 'INTERNAL', number: 'ZAP2026001', offset: { amount: '450.00' } });
    expect(result.counters).toEqual({ 2026: 2 });
    const after = docs.map(d => ({ ...d, ...(result.documents.find(p => p.id === d.id)?.patch || {}) }));
    expect(after.map(d => paymentState(d))).toEqual(['PAID', 'PARTIAL', 'PAID', 'UNPAID']);
    expect(after[0].payments[0]).toMatchObject({ method: 'OFFSET', offsetId: 'off-1', note: 'ZAP2026001' });
    const undone = cancelOffset('off-1', after);
    expect(undone).toHaveLength(3);
    expect(undone.every(u => u.patch.payments.length === 0)).toBe(true);
  });

  it('refuses an offset without both sides or above the possible amount', () => {
    expect(() => planOffset(docs, { contactId: 'c2' })).toThrow(expect.objectContaining({ code: 'OFFSET_NOTHING' }));
    expect(() => planOffset(docs, { contactId: 'c1', amount: '451' })).toThrow(expect.objectContaining({ code: 'OFFSET_AMOUNT_INVALID' }));
  });
});

describe('eKasa stage 1', () => {
  const company = { usesEkasa: true };
  const sale = invoice('FA7', 'INVOICE', '123.00', { buyer: { name: 'Beta', ico: '12345679' } });
  const pay = (method, amount = '123.00') => ({ date: '2026-10-10', amount, method, currency: 'EUR' });

  it('is needed for cash, card and on-site QR payments of a sale unless the company does not use eKasa', () => {
    expect(ekasaNeeded(sale, pay('CASH'), company)).toBe(true);
    expect(ekasaNeeded(sale, pay('QR_ON_SITE'), company)).toBe(true);
    expect(ekasaNeeded(sale, pay('TRANSFER'), company)).toBe(false);
    expect(ekasaNeeded(sale, pay('CARD'), { usesEkasa: false })).toBe(false);
    expect(ekasaNeeded(invoice('PF', 'RECEIVED_INVOICE', '1'), pay('CASH'), company)).toBe(false);
  });

  it('for an invoice gives number and amount, no VAT lines, the VRP2 link and the B2B limit', () => {
    const entry = ekasaManualEntry(sale, pay('CASH'), company);
    expect(entry).toMatchObject({ needed: true, invoicePayment: true, invoiceNumber: 'FA7', amount: '123.00', vrp2Url: 'https://vrp2.financnasprava.sk', vatLines: [] });
    expect(entry.cashLimit).toMatchObject({ applies: true, exceeded: false });
    expect(ekasaManualEntry(sale, pay('CASH', '5000.01'), company).cashLimit.exceeded).toBe(true);
  });

  it('for a sales receipt splits the paid share by VAT rate', () => {
    const receipt = {
      id: 'r', kind: 'SALES_RECEIPT', currency: 'EUR', number: 'PK1', status: 'ISSUED',
      lines: [
        { id: 'a', name: 'A', qty: '1', unitPrice: '12.30', priceType: 'GROSS', vatCategory: 'S', vatRate: '23' },
        { id: 'b', name: 'B', qty: '1', unitPrice: '10.50', priceType: 'GROSS', vatCategory: 'S', vatRate: '5' }
      ]
    };
    const entry = ekasaManualEntry(receipt, pay('CARD', '22.80'), company);
    expect(entry.invoicePayment).toBe(false);
    expect(entry.vatLines).toEqual([
      { category: 'S', rate: '23', gross: '12.30', vat: '2.30', base: '10.00' },
      { category: 'S', rate: '5', gross: '10.50', vat: '0.50', base: '10.00' }
    ]);
  });
});

describe('payment list', () => {
  const docs = [
    invoice('FA1', 'INVOICE', '100', { buyer: { name: 'Beta' }, payments: [{ id: 'p1', date: '2026-10-02', amount: '100.00', method: 'CASH', source: 'MANUAL' }] }),
    invoice('PF1', 'RECEIVED_INVOICE', '50', { seller: { name: 'Alfa' }, payments: [{ id: 'p2', date: '2026-10-05', amount: '50.00', method: 'TRANSFER', source: 'BANK_IMPORT', note: 'x' }] })
  ];

  it('flattens, sorts newest first and filters', () => {
    expect(listPayments(docs).map(r => r.id)).toEqual(['PF1:p2', 'FA1:p1']);
    expect(listPayments(docs, { direction: 'IN' }).map(r => r.party)).toEqual(['Beta']);
    expect(listPayments(docs, { method: 'TRANSFER', source: 'BANK_IMPORT' })).toHaveLength(1);
    expect(listPayments(docs, { from: '2026-10-03' })).toHaveLength(1);
    expect(listPayments(docs, { query: 'alfa' }).map(r => r.docNumber)).toEqual(['PF1']);
  });
});

describe('public API', () => {
  it('re-exports the bank names through the core index without clashes', () => {
    ['parseBankStatement', 'matchBankTx', 'matchStatement', 'applyMatch', 'buildPain001', 'paymentsForReceived', 'buildCashVoucher',
      'cashBookRows', 'cashBookCsv', 'cashLimitCheck', 'planOffset', 'buildOffset', 'ekasaManualEntry', 'listPayments', 'makePayment', 'addPayment']
      .forEach(name => expect(typeof core[name]).toBe('function'));
  });
});
