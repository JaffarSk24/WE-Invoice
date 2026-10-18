import { describe, it, expect } from 'vitest';
import { outRows, filterOut, inRows, lastReceivedAt, outGroup } from './rows.js';

const company = { vatMode: 'PAYER', address: { country: 'SK' }, dic: '2020000004' };
const buyer = { name: 'Beta a.s.', ico: '35000031', dic: '2020000026', address: { country: 'SK' } };
const line = { id: 'l', name: 'a', qty: '1', unitPrice: '100', vatCategory: 'S', vatRate: '23' };
const doc = (fields) => ({ id: fields.number, kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', issueDate: '2027-01-10', taxDate: '2027-01-10', buyer, lines: [line], ...fields });

describe('e-invoice list rows', () => {
  const documents = [
    doc({ number: 'A' }),
    doc({ number: 'B', peppol: { direction: 'OUT', status: 'DELIVERED' } }),
    doc({ number: 'C', peppol: { direction: 'OUT', status: 'INVALID' } }),
    doc({ number: 'D', status: 'DRAFT' }),
    doc({ number: 'E', kind: 'PROFORMA' }),
    doc({ number: 'F', buyer: { name: 'Ján Novák' }, issueDate: '2027-01-11' }),
    doc({ number: 'G', kind: 'RECEIVED_INVOICE', status: 'TO_PROCESS', receivedDate: '2027-01-12', seller: { name: 'Dodávateľ' }, peppol: { direction: 'IN', status: 'RECEIVED', receivedAt: '2027-01-12T09:00:00Z', errors: [{ code: 'TOTALS_MISMATCH' }] } })
  ];

  it('lists sent documents and the issued ones that must or may go through Peppol', () => {
    const rows = outRows(documents, company, new Map(), '2027-01-20');
    expect(rows.map(r => r.number)).toEqual(['C', 'B', 'A']);
    const a = rows.find(r => r.number === 'A');
    expect(a).toMatchObject({ status: 'NOT_SENT', group: 'waiting', mandatory: true, daysLeft: 5, sendable: true, total: '123.00', partner: 'Beta a.s.' });
    expect(rows.find(r => r.number === 'B')).toMatchObject({ group: 'delivered', daysLeft: null, sendable: false });
    expect(rows.find(r => r.number === 'C')).toMatchObject({ group: 'problems', sendable: true });
  });

  it('filters by group', () => {
    const rows = outRows(documents, company, new Map(), '2027-01-20');
    expect(filterOut(rows, 'all')).toHaveLength(3);
    expect(filterOut(rows, 'problems').map(r => r.number)).toEqual(['C']);
    expect(outGroup('SENDING')).toBe('waiting');
  });

  it('lists received e-invoices with their warnings and the last receipt', () => {
    expect(inRows(documents)).toEqual([expect.objectContaining({ number: 'G', partner: 'Dodávateľ', warnings: 1, receivedDate: '2027-01-12' })]);
    expect(lastReceivedAt(documents)).toBe('2027-01-12T09:00:00Z');
    expect(lastReceivedAt([])).toBeNull();
  });
});
