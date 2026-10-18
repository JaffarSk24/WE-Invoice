// Export for WE Budget: the money that actually moved, as a bank-style
// CSV its statement import reads (WE-Budget src/import/bank.js): ISO
// dates, one signed amount column with a dot, a description, the
// counterparty and a note. Payments received on issued documents are
// income, payments of received invoices and receipts are expenses (a
// credit note turns the sign). Only one currency goes into a file, as a
// WE Budget account has one; the rest is listed as skipped.
import { exportCsv } from './csv.js';
import { neg, round, isNegative, isZero } from '../money/index.js';
import { isPurchase, SALES_KINDS, PURCHASE_KINDS } from './period.js';
import { partnerOf } from './pohoda.js';

export const WE_BUDGET_COLUMNS = Object.freeze(['Date', 'Amount', 'Description', 'Counterparty', 'Note']);
const REFUNDS = new Set(['CREDIT_NOTE', 'RECEIVED_CREDIT_NOTE']);

/**
 * Rows of money movements in a period.
 * @param {object[]} documents
 * @param {{from?: string, to?: string, currency?: string, describe?: (document: object) => string}} ctx
 */
export function weBudgetRows(documents, ctx = {}) {
  const currency = ctx.currency || 'EUR';
  const describe = ctx.describe || (d => d.number || '');
  const rows = [];
  const skipped = [];
  (documents || []).filter(d => d && !d.deleted && d.status !== 'DRAFT' && d.status !== 'CANCELLED')
    .filter(d => SALES_KINDS.includes(d.kind) || PURCHASE_KINDS.includes(d.kind))
    .forEach(d => {
      (d.payments || []).forEach(p => {
        if (!p.date || (ctx.from && p.date < ctx.from) || (ctx.to && p.date > ctx.to)) return;
        if ((p.currency || d.currency) !== currency) {
          skipped.push({ id: d.id, number: d.number, reason: 'CURRENCY' });
          return;
        }
        let amount = round(p.amount, 2);
        if (isZero(amount)) return;
        const outgoing = isPurchase(d) !== REFUNDS.has(d.kind);
        if (outgoing !== isNegative(amount)) amount = round(neg(amount), 2);
        rows.push({ date: p.date, amount, description: describe(d), counterparty: partnerOf(d).name || '', note: d.vs || '', docId: d.id });
      });
    });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  return { rows, skipped };
}

/**
 * CSV for the WE Budget import.
 * @returns {{content: string, count: number, skipped: Array}}
 */
export function exportWeBudgetCsv(data, ctx = {}) {
  const { rows, skipped } = weBudgetRows(data.documents, ctx);
  const keys = ['date', 'amount', 'description', 'counterparty', 'note'];
  const columns = WE_BUDGET_COLUMNS.map((header, i) => ({ header, key: keys[i] }));
  return { content: exportCsv(rows, columns, { delimiter: ',', bom: true }), count: rows.length, skipped };
}
