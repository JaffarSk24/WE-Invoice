// Conversions offered on a document (03-features.md § 3.6) and the pieces
// the editor needs around them: which targets make sense now, the advance
// payments a final invoice may deduct, the invoices a correction may
// refer to. The conversion itself is the core's convertDocument; this
// module only chooses its inputs. Pure functions.
import { convertDocument, conversionTargets, paidAmount, round, sub, cmp, sum, isZero } from '@we-invoice/core';
import { safeTotals } from '../documents/rows.js';
import { dueDateFor } from './draft.js';

const LIVE = (d) => !d.deleted && d.status !== 'DRAFT' && d.status !== 'CANCELLED';
export const CORRECTION_KINDS = Object.freeze(['CREDIT_NOTE', 'DEBIT_NOTE']);

export function needsReason(target) {
  return CORRECTION_KINDS.includes(target);
}

function advanceDocsOf(proforma, documents) {
  return (documents || []).filter(d => LIVE(d) && d.kind === 'ADVANCE_TAX_DOC' && (d.links || []).some(l => l.kind === 'FROM_PROFORMA' && l.docId === proforma.id));
}

/** Targets a document may be converted to now (a draft converts to nothing). */
export function availableConversions(doc, documents = []) {
  if (doc.status === 'DRAFT' || doc.status === 'CANCELLED') return [];
  return conversionTargets(doc.kind).filter(target => {
    if (doc.kind === 'PROFORMA' && target === 'ADVANCE_TAX_DOC') return !isZero(paidAmount(doc)) && advanceDocsOf(doc, documents).length === 0;
    return true;
  });
}

/** Amount of an advance document already deducted by other documents. */
export function deductedAmount(advanceId, documents, exceptId = null) {
  const amounts = [];
  (documents || []).forEach(d => {
    if (d.deleted || d.id === exceptId || d.status === 'CANCELLED') return;
    (d.links || []).forEach(l => { if (l.kind === 'ADVANCE_DEDUCTION' && l.docId === advanceId && l.amount) amounts.push(l.amount); });
  });
  return round(sum(amounts), 2);
}

/** What an advance document can still be deducted with: the paid proforma amount or the tax document total. */
export function advanceAvailable(advance, documents, exceptId = null) {
  const base = advance.kind === 'PROFORMA' ? paidAmount(advance) : safeTotals(advance).gross;
  return round(sub(base, deductedAmount(advance.id, documents, exceptId)), 2);
}

/**
 * Paid proformas and tax documents to received payments of a client that
 * a final invoice may still deduct. A proforma whose payment already has
 * its own tax document is offered through that document only.
 */
export function deductionCandidates(documents, { contactId, currency, exceptId = null }) {
  return (documents || []).filter(d => {
    if (!LIVE(d) || d.id === exceptId || (contactId && d.contactId !== contactId)) return false;
    if ((d.currency || 'EUR') !== (currency || 'EUR')) return false;
    if (d.kind === 'PROFORMA' && advanceDocsOf(d, documents).length) return false;
    if (d.kind !== 'PROFORMA' && d.kind !== 'ADVANCE_TAX_DOC') return false;
    return cmp(advanceAvailable(d, documents, exceptId), '0') > 0;
  });
}

/** Issued invoices of a client a credit or debit note may correct. */
export function correctionCandidates(documents, { contactId = null } = {}) {
  return (documents || []).filter(d => LIVE(d) && (d.kind === 'INVOICE' || d.kind === 'ADVANCE_TAX_DOC') && (!contactId || d.contactId === contactId));
}

function lastPaymentDate(doc) {
  const dates = (doc.payments || []).filter(p => !p.deleted).map(p => p.date).sort();
  return dates[dates.length - 1] || null;
}

/**
 * The new draft for a conversion. A final invoice from a proforma deducts
 * the tax documents to its payments when they exist, else what was paid
 * on the proforma; the tax document to a payment takes the date of the
 * last payment as its tax date.
 * @param {{documents?: Array, today: string, reason?: string, company?: object, contact?: object, id?: string, now?: string}} ctx
 */
export function convertForEditor(doc, target, ctx) {
  const { documents = [], today, company = null, contact = null } = ctx;
  const draft = convertDocument(doc, target, {
    id: ctx.id, now: ctx.now, today, reason: ctx.reason,
    paymentDate: target === 'ADVANCE_TAX_DOC' ? lastPaymentDate(doc) || today : undefined
  });
  if (doc.kind === 'PROFORMA' && target === 'INVOICE') {
    const advances = advanceDocsOf(doc, documents);
    if (advances.length) {
      draft.links = [draft.links[0], ...advances.map(a => ({ kind: 'ADVANCE_DEDUCTION', docId: a.id, amount: advanceAvailable(a, documents) }))]
        .filter(l => l.kind !== 'ADVANCE_DEDUCTION' || cmp(l.amount, '0') > 0);
    }
  }
  if (target === 'INVOICE' || target === 'PROFORMA' || needsReason(target)) {
    draft.taxDate = target === 'PROFORMA' ? null : (draft.taxDate || today);
    draft.dueDate = dueDateFor(draft.issueDate, contact, company);
  }
  return draft;
}
