// The narrow amount helpers of the reports (eurNet, eurDue) give the same
// figures as eurAmounts, and the running sums of bump() write out the same
// decimal strings as adding the strings one by one.
import { describe, it, expect } from 'vitest';
import Big from 'big.js';
import { eurAmounts, eurNet, eurDue, bump, asText, fixed2 } from './amounts.js';
import { add } from '../money/index.js';

const doc = (over = {}) => ({
  id: 'd', kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', totals: { net: '100.00', vat: '23.00', gross: '123.00', payable: '123.00' }, payments: [], ...over
});

describe('narrow report amounts', () => {
  it('match eurAmounts for sales, credit notes, foreign currency and part payments', () => {
    const cases = [
      doc(),
      doc({ kind: 'CREDIT_NOTE', totals: { net: '-40.00', vat: '-9.20', gross: '-49.20', payable: '-49.20' } }),
      doc({ currency: 'CZK', fxRate: '25.123', totals: { net: '1000.00', vat: '210.00', gross: '1210.00', payable: '1210.00' } }),
      doc({ currency: 'USD', fxRate: null }),
      doc({ payments: [{ id: 'p', amount: '23.00', currency: 'EUR' }] }),
      doc({ payments: [{ id: 'p', amount: '200.00' }] }),
      doc({ kind: 'RECEIVED_INVOICE', totals: { net: '10.10', vat: '2.32', gross: '12.42' } })
    ];
    for (const d of cases) {
      const all = eurAmounts(d);
      expect([eurNet(d), eurDue(d)], d.kind + d.currency).toEqual([all.net, all.due]);
    }
  });

  it('keeps running sums that write out like added strings', () => {
    const map = new Map();
    const values = ['10.10', '-0.10', '3.335', '0', '-13.335', '100'];
    let expected = '0';
    for (const v of values) {
      bump(map, 'k', () => ({ net: '0', count: 0 }), { net: v, count: 1 });
      expected = add(expected, v);
    }
    const entry = map.get('k');
    expect(entry.count).toBe(6);
    expect(asText(entry.net)).toBe(expected);
    expect(fixed2([{ net: entry.net }], ['net'])[0].net).toBe('100.00');
  });

  it('writes a negative zero as zero', () => {
    expect(asText(new Big('-1').plus('1'))).toBe('0');
    expect(asText(new Big('-0'))).toBe('0');
    expect(asText('1.50')).toBe('1.50');
  });
});
