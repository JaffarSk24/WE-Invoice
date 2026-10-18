// Payment states, amount due, overdue by the local date and late payment
// interest with the ECB rate supplied by the caller.
import { describe, it, expect } from 'vitest';
import { paymentState, amountDue, paymentStatus, paidAmount, payableOf, lateInterest } from './index.js';

const code = (fn) => { try { fn(); } catch (e) { return e.code; } return null; };
const invoice = (payments = [], over = {}) => ({
  kind: 'INVOICE', currency: 'EUR', dueDate: '2026-10-18', totals: { payable: '123.00', net: '100.00', vat: '23.00', gross: '123.00' },
  payments: payments.map((amount, i) => ({ id: `p${i}`, date: '2026-10-10', amount, method: 'TRANSFER', source: 'MANUAL' })),
  ...over
});

describe('paymentState and amountDue', () => {
  it('UNPAID without payments', () => {
    expect(paymentState(invoice())).toBe('UNPAID');
    expect(amountDue(invoice())).toBe('123.00');
  });

  it('PARTIAL, PAID and OVERPAID', () => {
    expect(paymentState(invoice(['23']))).toBe('PARTIAL');
    expect(amountDue(invoice(['23']))).toBe('100.00');
    expect(paymentState(invoice(['100', '23']))).toBe('PAID');
    expect(amountDue(invoice(['100', '23']))).toBe('0.00');
    expect(paymentState(invoice(['123.01']))).toBe('OVERPAID');
    expect(amountDue(invoice(['123.01']))).toBe('-0.01');
  });

  it('a zero document is PAID, a zero document with no payments is PAID too', () => {
    expect(paymentState(invoice([], { totals: { payable: '0.00' } }))).toBe('PAID');
    expect(paymentState(invoice(['0'], { totals: { payable: '0.00' } }))).toBe('PAID');
  });

  it('computes totals when none are stored', () => {
    const doc = { kind: 'INVOICE', currency: 'EUR', lines: [{ id: 'l', name: 'a', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23' }], payments: [] };
    expect(payableOf(doc)).toBe('123.00');
    expect(paymentState(doc)).toBe('UNPAID');
  });

  it('ignores payments in another currency and deleted ones', () => {
    const doc = invoice(['123']);
    doc.payments[0].currency = 'CZK';
    expect(paidAmount(doc)).toBe('0.00');
    const gone = invoice(['123']);
    gone.payments[0].deleted = true;
    expect(paidAmount(gone)).toBe('0.00');
    const same = invoice(['123']);
    same.payments[0].currency = 'EUR';
    expect(paidAmount(same)).toBe('123.00');
  });
});

describe('paymentStatus', () => {
  it('is OVERDUE after the due date while something is due', () => {
    expect(paymentStatus(invoice(), '2026-10-18')).toBe('UNPAID');
    expect(paymentStatus(invoice(), '2026-10-19')).toBe('OVERDUE');
    expect(paymentStatus(invoice(['1']), '2026-10-19')).toBe('OVERDUE');
    expect(paymentStatus(invoice(['123']), '2026-10-19')).toBe('PAID');
    expect(paymentStatus(invoice(['200']), '2026-10-19')).toBe('OVERPAID');
    expect(paymentStatus(invoice([], { dueDate: null }), '2027-01-01')).toBe('UNPAID');
  });

  it('defaults to today', () => {
    expect(paymentStatus(invoice([], { dueDate: '2000-01-01' }))).toBe('OVERDUE');
    expect(paymentStatus(invoice([], { dueDate: '2999-01-01' }))).toBe('UNPAID');
  });
});

describe('lateInterest', () => {
  it('B2B: ECB rate plus 9 points on a 365 day year', () => {
    const r = lateInterest({ amount: '1000', dueDate: '2026-01-01', until: '2026-01-31', b2b: true, ecbRatePct: '2.15' });
    expect(r).toEqual({ interest: '9.16', days: 30, ratePct: '11.15', recoveryCost: null });
  });

  it('B2C: ECB rate plus 5 points', () => {
    const r = lateInterest({ amount: '1000', dueDate: '2026-01-01', until: '2026-12-31', b2b: false, ecbRatePct: '2.15' });
    expect(r).toEqual({ interest: '71.30', days: 364, ratePct: '7.15', recoveryCost: null });
  });

  it('adds the flat recovery cost for B2B on request only', () => {
    expect(lateInterest({ amount: '100', dueDate: '2026-01-01', until: '2026-01-02', b2b: true, ecbRatePct: '2', recoveryCost: true }).recoveryCost).toBe('40.00');
    expect(lateInterest({ amount: '100', dueDate: '2026-01-01', until: '2026-01-02', b2b: false, ecbRatePct: '2', recoveryCost: true }).recoveryCost).toBeNull();
    expect(lateInterest({ amount: '100', dueDate: '2026-01-01', until: '2026-01-01', b2b: true, ecbRatePct: '2', recoveryCost: true }).recoveryCost).toBeNull();
  });

  it('nothing before or on the due date', () => {
    expect(lateInterest({ amount: '1000', dueDate: '2026-01-10', until: '2026-01-10', b2b: true, ecbRatePct: '2' })).toMatchObject({ interest: '0.00', days: 0 });
    expect(lateInterest({ amount: '1000', dueDate: '2026-01-10', until: '2026-01-01', b2b: true, ecbRatePct: '2' })).toMatchObject({ interest: '0.00', days: 0 });
  });

  it('needs the ECB rate and valid dates', () => {
    expect(code(() => lateInterest({ amount: '1', dueDate: '2026-01-01', until: '2026-02-01', b2b: true }))).toBe('ECB_RATE_REQUIRED');
    expect(code(() => lateInterest({ amount: '1', dueDate: '2026-01-01', until: '2026-02-01', b2b: true, ecbRatePct: '' }))).toBe('ECB_RATE_REQUIRED');
    expect(code(() => lateInterest({ amount: '1', dueDate: 'x', until: '2026-02-01', b2b: true, ecbRatePct: '2' }))).toBe('DATE_INVALID');
    expect(code(() => lateInterest())).toBe('ECB_RATE_REQUIRED');
  });

  it('a zero ECB rate still carries the margin', () => {
    expect(lateInterest({ amount: '365', dueDate: '2026-01-01', until: '2026-01-11', b2b: true, ecbRatePct: '0' })).toMatchObject({ interest: '0.90', ratePct: '9.00' });
  });
});
