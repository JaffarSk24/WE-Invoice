// The tray summary: open receivables in the company currency and overdue
// invoices on the local date.
import { describe, it, expect } from 'vitest';
import { traySummary } from './tray-summary.js';

const doc = (over = {}) => ({
  id: over.id || 'd', kind: 'INVOICE', status: 'ISSUED', currency: 'EUR', issueDate: '2026-10-01', dueDate: '2026-10-31',
  totals: { gross: '100.00', payable: '100.00' }, payments: [], ...over
});

describe('tray summary', () => {
  it('sums what clients owe and counts overdue invoices', () => {
    const docs = [
      doc({ id: 'a' }),
      doc({ id: 'b', dueDate: '2026-10-10', payments: [{ amount: '40.00', date: '2026-10-05' }] }),
      doc({ id: 'c', status: 'DRAFT' }),
      doc({ id: 'd', kind: 'RECEIVED_INVOICE' }),
      doc({ id: 'e', currency: 'CZK', dueDate: '2026-10-01' }),
      doc({ id: 'f', payments: [{ amount: '100.00', date: '2026-10-02' }] })
    ];
    const s = traySummary(docs, { defaults: { currency: 'EUR' }, peppol: { enabled: true } }, '2026-10-19');
    expect(s).toEqual({ show: true, dueTotal: '160.00', currency: 'EUR', overdueCount: 2, canReceive: true });
  });

  it('is empty without documents or a company', () => {
    expect(traySummary([], null, '2026-10-19')).toEqual({ show: true, dueTotal: '0.00', currency: 'EUR', overdueCount: 0, canReceive: false });
  });
});
