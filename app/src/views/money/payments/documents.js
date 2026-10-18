// Open documents to pay or to match by hand, with a label to find them by
// number or party.
import { paymentCandidates, paymentParty } from '@we-invoice/core';

/** Open documents paid by money in (IN) or out (OUT), optionally in one currency. */
export function openDocuments(state, direction, currency = null) {
  const probe = { amount: direction === 'OUT' ? '-1' : '1', currency: currency || undefined };
  return paymentCandidates(probe, state.documents, state.contacts)
    .sort((a, b) => String(a.doc.dueDate || '').localeCompare(String(b.doc.dueDate || '')));
}

/** Both directions together, for the manual payment dialog. */
export function allOpenDocuments(state) {
  return [...openDocuments(state, 'IN'), ...openDocuments(state, 'OUT')];
}

export function documentLabel(candidate) {
  const doc = candidate.doc || candidate;
  return [doc.number || doc.id, paymentParty(doc)?.name].filter(Boolean).join(' ');
}
