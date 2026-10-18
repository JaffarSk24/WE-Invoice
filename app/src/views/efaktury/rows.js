// What the two e-invoice lists show, as pure functions over documents:
// the outgoing list holds every tax document that has gone or should go
// through Peppol (with the days left to the 15-day deadline for those that
// must), the incoming list every document received through Peppol.
import { computeTotals, peppolRequirement } from '@we-invoice/core';

const OUT_KINDS = new Set(['INVOICE', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ADVANCE_TAX_DOC', 'SELF_BILLING']);
const SKIP_STATUSES = new Set(['DRAFT', 'CANCELLED']);
const PROBLEMS = new Set(['INVALID', 'REJECTED', 'FAILED']);
const DONE = new Set(['ACCEPTED', 'DELIVERED']);
const BUSY = new Set(['VALIDATING', 'READY', 'SENDING']);

function gross(document) {
  if (document.totals?.gross) return document.totals.gross;
  try {
    return computeTotals(document).gross;
  } catch (error) {
    console.warn('efaktury: totals not computable', document.id, error.code);
    return null;
  }
}

/** Group of an outgoing row for the filter tabs. */
export function outGroup(status) {
  if (DONE.has(status)) return 'delivered';
  if (PROBLEMS.has(status)) return 'problems';
  return 'waiting';
}

/**
 * @param {object[]} documents
 * @param {object} company
 * @param {Map<string, object>} contacts  by id
 * @param {string} today  local calendar date
 */
export function outRows(documents, company, contacts, today) {
  const rows = [];
  for (const d of documents) {
    if (!OUT_KINDS.has(d.kind) || SKIP_STATUSES.has(d.status)) continue;
    const contact = d.contactId ? contacts.get(d.contactId) || null : null;
    const sent = d.peppol?.direction === 'OUT';
    let requirement = null;
    try {
      requirement = peppolRequirement(company, contact, d, today);
    } catch (error) {
      console.warn('efaktury: requirement not known', d.id, error.code);
    }
    const wanted = requirement && (requirement.requirement === 'MANDATORY' || (requirement.requirement === 'OPTIONAL' && (d.buyer?.dic || d.buyer?.peppolId || contact?.dic || contact?.peppolId)));
    if (!sent && !wanted) continue;
    const status = sent ? d.peppol.status : 'NOT_SENT';
    rows.push({
      id: d.id, document: d, number: d.number || '', partner: d.buyer?.name || contact?.name || '', issueDate: d.issueDate || '',
      total: gross(d), currency: d.currency || 'EUR', status, group: outGroup(status), busy: BUSY.has(status),
      mandatory: requirement?.requirement === 'MANDATORY',
      daysLeft: !DONE.has(status) && requirement?.requirement === 'MANDATORY' ? requirement.daysLeft ?? null : null,
      sendable: !DONE.has(status) && !BUSY.has(status)
    });
  }
  return rows.sort((a, b) => String(b.issueDate).localeCompare(String(a.issueDate)) || String(b.number).localeCompare(String(a.number)));
}

export function filterOut(rows, group) {
  return group && group !== 'all' ? rows.filter(r => r.group === group) : rows;
}

export function inRows(documents) {
  return documents.filter(d => d.peppol?.direction === 'IN')
    .map(d => ({
      id: d.id, document: d, number: d.number || '', partner: d.seller?.name || '', issueDate: d.issueDate || '', receivedDate: d.receivedDate || '',
      total: gross(d), currency: d.currency || 'EUR', status: d.status, warnings: (d.peppol.errors || []).length
    }))
    .sort((a, b) => String(b.receivedDate).localeCompare(String(a.receivedDate)) || String(b.number).localeCompare(String(a.number)));
}

/** Latest receipt time among received e-invoices, or null. */
export function lastReceivedAt(documents) {
  return documents.reduce((max, d) => (d.peppol?.direction === 'IN' && d.peppol.receivedAt && (!max || d.peppol.receivedAt > max) ? d.peppol.receivedAt : max), null);
}
