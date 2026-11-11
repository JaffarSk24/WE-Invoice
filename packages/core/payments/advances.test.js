// A paid received proforma and the invoice that settles it: the pair is
// found by the number written on the invoice or by the amount, both show
// as paid, and the money is counted once.
import { describe, it, expect } from 'vitest';
import {
  findAdvanceFor, findInvoiceFor, advanceChoicesFor, withAdvance, withoutAdvance, isSettledAdvance,
  sameSupplier, settlementAmount, ownPaid
} from './advances.js';
import { paidAmount, amountDue, paymentState } from './index.js';
import { paymentDirection } from '../ledger/payment-entries.js';
import { selectDocuments } from '../exports/period.js';
import { DOCUMENT_KINDS, LINK_KINDS } from '../schema/enums.js';

const seller = { name: 'Reálna podpora s.r.o.', ico: '12345679', dic: '2020000004', icDph: 'SK2020000004' };
const pay = (amount, date = '2026-10-05') => ({ id: `p-${amount}-${date}`, date, amount, currency: 'EUR', method: 'TRANSFER', source: 'BANK_IMPORT', bankTxId: 'tx-1' });
const totals = (gross, prepaid = '0.00') => ({ net: gross, vat: '0.00', gross, prepaid, payable: (Number(gross) - Number(prepaid)).toFixed(2) });

function proforma(extra = {}) {
  return { id: 'pf-1', kind: 'RECEIVED_PROFORMA', number: 'ZF2026015', status: 'PAID', currency: 'EUR', issueDate: '2026-10-01', seller, totals: totals('120.00'), payments: [pay('120.00')], links: [], ...extra };
}
function invoice(extra = {}) {
  return { id: 'fa-1', kind: 'RECEIVED_INVOICE', number: '260101476', status: 'PROCESSED', currency: 'EUR', issueDate: '2026-11-09', seller, totals: totals('120.00'), payments: [], links: [], lines: [{ name: 'Služby podpory' }], ...extra };
}

describe('received proforma settled by an invoice', () => {
  it('pairs an invoice with the paid proforma of the same amount and counts the advance as paid', () => {
    const pf = proforma();
    const fa = invoice();
    const found = findAdvanceFor(fa, [pf, fa]);
    expect(found).toMatchObject({ proforma: { id: 'pf-1' }, amount: '120.00', by: 'AMOUNT' });
    const linked = withAdvance(fa, pf, found.amount);
    expect(linked.links).toEqual([{ kind: 'ADVANCE_PAID', docId: 'pf-1', amount: '120.00' }]);
    expect(paidAmount(linked)).toBe('120.00');
    expect(amountDue(linked)).toBe('0.00');
    expect(paymentState(linked)).toBe('PAID');
    expect(ownPaid(linked)).toBe('0.00');
    expect(isSettledAdvance(pf, [pf, linked])).toBe(true);
    expect(paymentState(pf)).toBe('PAID');
    expect(withoutAdvance(linked, 'pf-1').links).toEqual([]);
  });

  it('prefers the proforma whose number the invoice names, and leaves the rest to pay', () => {
    const named = proforma({ id: 'pf-2', number: 'ZF2026016', payments: [pay('50.00')] });
    const sameSize = proforma({ id: 'pf-3', number: 'ZF2026017' });
    const fa = invoice({ lines: [{ name: 'Odpočet zálohy ZF2026016' }] });
    const found = findAdvanceFor(fa, [named, sameSize, fa]);
    expect(found).toMatchObject({ proforma: { id: 'pf-2' }, amount: '50.00', by: 'NUMBER' });
    expect(amountDue(withAdvance(fa, named, found.amount))).toBe('70.00');
  });

  it('does not read a longer number as the proforma number', () => {
    const pf = proforma({ number: '2026016', payments: [pay('50.00')] });
    expect(findAdvanceFor(invoice({ orderReference: '20260169' }), [pf])).toBeNull();
  });

  it('takes an invoice that already deducts the advance (BT-113) without paying it twice', () => {
    const pf = proforma();
    const fa = invoice({ totals: totals('150.00', '120.00') });
    const found = findAdvanceFor(fa, [pf, fa]);
    expect(found).toMatchObject({ proforma: { id: 'pf-1' }, amount: '30.00' });
    expect(settlementAmount(invoice({ totals: totals('120.00', '120.00') }), pf)).toBe('0.00');
  });

  it('chooses nothing when two proformas fit only by amount, or the supplier or currency differ', () => {
    const a = proforma({ id: 'pf-a', number: 'ZF1' });
    const b = proforma({ id: 'pf-b', number: 'ZF2' });
    const fa = invoice();
    expect(findAdvanceFor(fa, [a, b, fa])).toBeNull();
    expect(findInvoiceFor(a, [a, b, fa])).toBeNull();
    expect(advanceChoicesFor(fa, [a, b, fa]).map(d => d.id)).toEqual(['pf-a', 'pf-b']);
    expect(findAdvanceFor(invoice({ seller: { ...seller, ico: '99999999', dic: null, icDph: null } }), [proforma()])).toBeNull();
    expect(findAdvanceFor(invoice({ currency: 'CZK' }), [proforma()])).toBeNull();
  });

  it('ignores unpaid, settled, cancelled and later proformas', () => {
    const fa = invoice();
    expect(findAdvanceFor(fa, [proforma({ payments: [] })])).toBeNull();
    expect(findAdvanceFor(fa, [proforma({ status: 'CANCELLED' })])).toBeNull();
    expect(findAdvanceFor(fa, [proforma({ issueDate: '2026-11-20' })])).toBeNull();
    const other = withAdvance(invoice({ id: 'fa-0' }), proforma(), '120.00');
    expect(findAdvanceFor(fa, [proforma(), other])).toBeNull();
    expect(findAdvanceFor(withAdvance(fa, proforma({ id: 'pf-x' }), '1.00'), [proforma()])).toBeNull();
  });

  it('finds the invoice from the proforma when the proforma is recorded or paid later', () => {
    const pf = proforma();
    const fa = invoice();
    expect(findInvoiceFor(pf, [pf, fa])).toMatchObject({ invoice: { id: 'fa-1' }, amount: '120.00' });
    expect(findInvoiceFor(proforma({ payments: [] }), [fa])).toBeNull();
  });

  it('knows a supplier by an identifier first and by the name without the legal form otherwise', () => {
    expect(sameSupplier({ ico: '123 456 79' }, { ico: '12345679', name: 'X' })).toBe(true);
    expect(sameSupplier({ ico: '12345679', name: 'A' }, { ico: '87654321', name: 'A' })).toBe(false);
    expect(sameSupplier({ name: 'Reálna podpora, s. r. o.' }, { name: 'Realna podpora s.r.o.' })).toBe(true);
    expect(sameSupplier({ name: '' }, { name: '' })).toBe(false);
  });

  it('books the money once: the proforma payment is the expense, the proforma no tax document', () => {
    expect(paymentDirection({ kind: 'RECEIVED_PROFORMA', links: [] })).toBe('EXPENSE');
    const period = { from: '2026-10-01', to: '2026-11-30' };
    expect(selectDocuments([proforma(), invoice()], period).map(d => d.id)).toEqual(['fa-1']);
  });

  it('is a kind and a link kind of the schema', () => {
    expect(DOCUMENT_KINDS).toContain('RECEIVED_PROFORMA');
    expect(LINK_KINDS).toContain('ADVANCE_PAID');
  });
});
