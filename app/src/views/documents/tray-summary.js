// The summary the desktop tray shows (boot/desktop.js listens to
// "desktop:tray"): what clients still owe in the company currency and how
// many invoices are overdue, on the local date. Pure; drafts, cancelled
// and received documents do not count, nor documents in other currencies.
import { amountDue, documentStatus, add, cmp, round, localDate } from '@we-invoice/core';

const RECEIVABLE = ['INVOICE', 'PROFORMA', 'DEBIT_NOTE'];
const OPEN = ['ISSUED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'];

export function traySummary(documents, company, today = localDate()) {
  const currency = (company && company.defaults && company.defaults.currency) || 'EUR';
  let dueTotal = '0.00';
  let overdueCount = 0;
  for (const doc of documents || []) {
    if (!doc || doc.deleted || !RECEIVABLE.includes(doc.kind)) continue;
    const status = documentStatus(doc, today);
    if (!OPEN.includes(status)) continue;
    if (status === 'OVERDUE') overdueCount += 1;
    if ((doc.currency || 'EUR') !== currency) continue;
    const due = amountDue(doc);
    if (cmp(due, '0') > 0) dueTotal = add(dueTotal, due);
  }
  return { show: true, dueTotal: round(dueTotal, 2), currency, overdueCount, canReceive: Boolean(company && company.peppol && company.peppol.enabled) };
}
