// Matching bank transactions with documents: every rule of § 3.9, partial
// payments and overpayments, one transaction for several documents and
// several transactions for one, and recording the confirmed match.
import { describe, it, expect } from 'vitest';
import { matchBankTx, matchStatement, applyMatch, unapplyMatch, makePayment, addPayment, statusAfterPayments } from './index.js';
import { paymentState } from '../index.js';

let n = 0;
function doc(fields = {}) {
  n += 1;
  const payable = fields.payable ?? '100.00';
  return {
    id: fields.id || `d${n}`, kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', number: `FA2026${String(n).padStart(4, '0')}`,
    vs: `2026${String(n).padStart(4, '0')}`, issueDate: '2026-09-01', dueDate: '2026-09-15', contactId: null,
    buyer: { name: 'Nobody' }, lines: [], payments: [], totals: { net: payable, vat: '0', gross: payable, payable }, ...fields
  };
}
const tx = (fields) => ({ id: 'tx1', date: '2026-10-05', currency: 'EUR', amount: '100.00', vs: null, counterpartyIban: null, counterpartyName: null, message: null, ref: null, ...fields });

const ALFA = { id: 'c-alfa', name: 'Alfa s.r.o.', iban: 'SK9709000000001234567891' };
const BETA = { id: 'c-beta', name: 'Beta, a.s.', iban: 'SK0902000000004400112233' };

describe('single document rules', () => {
  it('1. VS and amount: 100, exact', () => {
    const d = doc({ vs: '20260001' });
    const [best] = matchBankTx(tx({ vs: '20260001' }), [d]);
    expect(best).toMatchObject({ docId: d.id, confidence: 100, reason: 'VS_AMOUNT', kind: 'EXACT', difference: '0.00' });
    expect(best.reasons).toEqual(['VS', 'AMOUNT']);
  });

  it('2. VS with leading zeros in the statement still matches', () => {
    const d = doc({ vs: '20260001' });
    expect(matchBankTx(tx({ vs: '20260001' }), [d])[0].confidence).toBe(100);
    expect(matchBankTx(tx({ vs: '20260001' }), [{ ...d, vs: '0020260001' }])[0].confidence).toBe(100);
  });

  it('3. VS with a smaller amount: a partial payment', () => {
    const d = doc({ vs: '777' });
    const [best] = matchBankTx(tx({ vs: '777', amount: '40.00' }), [d]);
    expect(best).toMatchObject({ confidence: 85, reason: 'VS_OTHER_AMOUNT', kind: 'PARTIAL', difference: '-60.00' });
    expect(best.allocations).toEqual([{ docId: d.id, amount: '40.00' }]);
  });

  it('4. VS with a larger amount: an overpayment records the whole amount', () => {
    const d = doc({ vs: '778' });
    const [best] = matchBankTx(tx({ vs: '778', amount: '120.00' }), [d]);
    expect(best).toMatchObject({ kind: 'OVERPAID', difference: '20.00' });
    expect(best.allocations[0].amount).toBe('120.00');
  });

  it('5. IBAN of the contact and the amount: 90', () => {
    const d = doc({ contactId: ALFA.id, vs: '1' });
    const [best] = matchBankTx(tx({ counterpartyIban: ALFA.iban, counterpartyName: 'ALFA SRO' }), [d], [ALFA]);
    expect(best).toMatchObject({ confidence: 90, reason: 'IBAN_AMOUNT' });
    expect(best.reasons).toEqual(['IBAN', 'AMOUNT', 'NAME']);
  });

  it('6. document number in the message: 80, or 70 with another amount', () => {
    const d = doc({ number: 'FA-2026-0042', vs: '99' });
    expect(matchBankTx(tx({ message: 'Uhrada FA2026004' }), [d])[0]).toBeUndefined();
    expect(matchBankTx(tx({ message: 'Uhrada fa 2026 0042' }), [d])[0]).toMatchObject({ confidence: 80, reason: 'NUMBER' });
    expect(matchBankTx(tx({ message: 'FA-2026-0042', amount: '50.00' }), [d])[0]).toMatchObject({ confidence: 70, kind: 'PARTIAL' });
  });

  it('7. the VS written in the message when the VS field is empty', () => {
    const d = doc({ vs: '20261234' });
    expect(matchBankTx(tx({ message: 'platba 20261234 dakujem' }), [d])[0]).toMatchObject({ confidence: 80, reasons: ['VS_IN_TEXT', 'AMOUNT'] });
  });

  it('8. amount and name only: a 60 suggestion, legal forms ignored', () => {
    const d = doc({ contactId: BETA.id, vs: '5' });
    const [best] = matchBankTx(tx({ counterpartyName: 'BETA AS' }), [d], [BETA]);
    expect(best).toMatchObject({ confidence: 60, reason: 'NAME_AMOUNT' });
  });

  it('9. IBAN with another amount only when the party has a single open document', () => {
    const one = doc({ contactId: ALFA.id, vs: '6' });
    expect(matchBankTx(tx({ counterpartyIban: ALFA.iban, amount: '30.00' }), [one], [ALFA])[0]).toMatchObject({ confidence: 50, kind: 'PARTIAL' });
    const two = doc({ contactId: ALFA.id, vs: '7' });
    expect(matchBankTx(tx({ counterpartyIban: ALFA.iban, amount: '30.00' }), [one, two], [ALFA])).toEqual([]);
  });

  it('10. nothing in common: no proposal', () => {
    expect(matchBankTx(tx({ vs: '1', amount: '13.00', counterpartyName: 'Someone' }), [doc({ vs: '2' })])).toEqual([]);
  });
});

describe('which documents are candidates', () => {
  it('11. incoming money pays our invoices, outgoing money received ones', () => {
    const ours = doc({ vs: '42' });
    const received = doc({ kind: 'RECEIVED_INVOICE', status: 'PROCESSED', vs: '42', seller: { name: 'Dod' } });
    expect(matchBankTx(tx({ vs: '42' }), [ours, received]).map(p => p.docId)).toEqual([ours.id]);
    expect(matchBankTx(tx({ vs: '42', amount: '-100.00' }), [ours, received]).map(p => p.docId)).toEqual([received.id]);
  });

  it('12. drafts, cancelled, paid documents and other currencies are skipped', () => {
    const docs = [
      doc({ vs: '9', status: 'DRAFT' }), doc({ vs: '9', status: 'CANCELLED' }), doc({ vs: '9', currency: 'CZK' }),
      doc({ vs: '9', payments: [{ id: 'p', date: '2026-09-02', amount: '100.00', method: 'TRANSFER', source: 'MANUAL' }] })
    ];
    expect(matchBankTx(tx({ vs: '9' }), docs)).toEqual([]);
  });

  it('13. the open amount after an earlier partial payment is what must match', () => {
    const d = doc({ vs: '10', payments: [{ id: 'p', date: '2026-09-02', amount: '60.00', currency: 'EUR', method: 'TRANSFER', source: 'MANUAL' }] });
    expect(matchBankTx(tx({ vs: '10', amount: '40.00' }), [d])[0]).toMatchObject({ confidence: 100, kind: 'EXACT' });
  });
});

describe('several documents and several transactions', () => {
  it('14. one payment naming two invoices pays both, oldest due first', () => {
    const a = doc({ vs: '20260101', dueDate: '2026-09-10', payable: '70.00' });
    const b = doc({ vs: '20260102', dueDate: '2026-09-01', payable: '30.00' });
    const [best] = matchBankTx(tx({ message: 'VS 20260101 a 20260102' }), [a, b]);
    expect(best).toMatchObject({ reason: 'REFS_SUM', confidence: 90, kind: 'MULTI' });
    expect(best.allocations).toEqual([{ docId: b.id, amount: '30.00' }, { docId: a.id, amount: '70.00' }]);
  });

  it('15. one party pays the sum of some of its open invoices', () => {
    const docs = ['10.00', '25.50', '64.50', '99.00'].map(p => doc({ contactId: ALFA.id, payable: p, vs: null }));
    const [best] = matchBankTx(tx({ counterpartyIban: ALFA.iban, amount: '90.00' }), docs, [ALFA]);
    expect(best).toMatchObject({ reason: 'IBAN_SUM', confidence: 80 });
    expect(best.allocations.map(a => a.amount)).toEqual(['25.50', '64.50']);
  });

  it('16. two named invoices and too little money: the older one is paid in full', () => {
    const a = doc({ vs: '30001', dueDate: '2026-09-01', payable: '50.00' });
    const b = doc({ vs: '30002', dueDate: '2026-09-20', payable: '50.00' });
    const [best] = matchBankTx(tx({ message: '30001, 30002', amount: '70.00' }), [a, b]).filter(p => p.docIds.length === 2);
    expect(best).toMatchObject({ reason: 'REFS', kind: 'MULTI_PARTIAL' });
    expect(best.allocations).toEqual([{ docId: a.id, amount: '50.00' }, { docId: b.id, amount: '20.00' }]);
  });

  it('17. two partial payments in one statement are matched one after the other', () => {
    const d = doc({ vs: '555', payable: '100.00' });
    const results = matchStatement([tx({ id: 't2', vs: '555', amount: '60.00', date: '2026-10-06' }), tx({ id: 't1', vs: '555', amount: '40.00', date: '2026-10-05' })], [d]);
    expect(results[1].preselected).toBeNull();
    expect(results[1].proposals[0]).toMatchObject({ confidence: 85, kind: 'PARTIAL' });
    expect(results[0].proposals[0].kind).toBe('PARTIAL');
  });

  it('18. a confident match reserves the money so the next line does not take the same invoice', () => {
    const d = doc({ vs: '556' });
    const results = matchStatement([tx({ id: 't1', vs: '556' }), tx({ id: 't2', vs: '556' })], [d]);
    expect(results[0].preselected).toMatchObject({ confidence: 100 });
    expect(results[1].proposals).toEqual([]);
  });

  it('19. already confirmed transactions are not matched again', () => {
    const results = matchStatement([tx({ vs: '557', matched: { docId: 'x', confidence: 100, confirmed: true } })], [doc({ vs: '557' })]);
    expect(results[0].proposals).toEqual([]);
  });
});

describe('recording the match', () => {
  it('20. confirming writes the payment, marks the transaction and the invoice becomes paid', () => {
    const d = doc({ vs: '600' });
    const t = tx({ vs: '600' });
    const [best] = matchBankTx(t, [d]);
    const result = applyMatch(t, best, [d], { newId: () => 'pay-1' });
    expect(result.tx.matched).toEqual({ docId: d.id, confidence: 100, confirmed: true });
    const patch = result.documents[0].patch;
    expect(patch.status).toBe('PAID');
    expect(patch.payments[0]).toMatchObject({ id: 'pay-1', date: '2026-10-05', amount: '100.00', method: 'TRANSFER', source: 'BANK_IMPORT', bankTxId: 'tx1' });
    expect(paymentState({ ...d, ...patch })).toBe('PAID');
  });

  it('21. undoing removes only the payments of that transaction', () => {
    const d = doc({ vs: '601', payments: [{ id: 'm', date: '2026-09-01', amount: '10.00', method: 'CASH', source: 'MANUAL', bankTxId: null }] });
    const paid = { ...d, ...addPayment(d, makePayment(d, { date: '2026-10-05', amount: '90.00', bankTxId: 'tx1', source: 'BANK_IMPORT' })) };
    expect(paid.status).toBe('PAID');
    const undone = unapplyMatch({ id: 'tx1' }, [paid]);
    expect(undone.documents[0].patch.payments.map(p => p.id)).toEqual(['m']);
    expect(undone.documents[0].patch.status).toBe('PARTIALLY_PAID');
    expect(undone.tx.matched).toBeNull();
  });

  it('22. statuses follow the payment state and keep drafts and received flows sane', () => {
    expect(statusAfterPayments(doc({ status: 'DRAFT' }))).toBe('DRAFT');
    const received = doc({ kind: 'RECEIVED_INVOICE', status: 'PAID' });
    expect(statusAfterPayments(received)).toBe('PROCESSED');
    const ours = doc({ status: 'PAID' });
    expect(statusAfterPayments(ours)).toBe('ISSUED');
  });

  it('23. refuses payments in another currency and empty amounts', () => {
    const d = doc();
    expect(() => addPayment(d, { ...makePayment(d, { date: '2026-10-05', amount: '5' }), currency: 'CZK' })).toThrow(expect.objectContaining({ code: 'BANK_PAYMENT_CURRENCY_MISMATCH' }));
    expect(() => makePayment(d, { date: '2026-10-05', amount: '0' })).toThrow(expect.objectContaining({ code: 'AMOUNT_INVALID' }));
    expect(() => applyMatch({ date: '2026-10-05' }, { allocations: [] }, [])).toThrow(expect.objectContaining({ code: 'BANK_TX_NOT_STORED' }));
  });
});
