// Document numbers after a merge (02-architecture.md § 2.6): two devices
// offline can issue the same number of the same series. The core finds
// the duplicates and proposes the next free number for documents that are
// not locked; a locked (sent) document is never renumbered, the user is
// warned instead. The core function may still be a stub (WP-CORE): then
// no conflicts are reported and a warning is logged once.
import { findNumberConflicts, vsFromNumber } from '@we-invoice/core';

let warned = false;

function safeVs(number, vs) {
  try {
    return vs(number);
  } catch (e) {
    return null;
  }
}

// Returns { data, conflicts, renumbered }. `data` is the same object when
// nothing changed.
export function resolveNumberConflicts(data, { now = new Date().toISOString(), finder = findNumberConflicts, vs = vsFromNumber } = {}) {
  let conflicts;
  try {
    conflicts = finder(data.documents || [], (data.company && data.company.series) || []) || [];
  } catch (e) {
    if (e && e.code === 'NOT_IMPLEMENTED') {
      if (!warned) console.warn('Number conflicts are not checked yet: findNumberConflicts is not implemented');
      warned = true;
      return { data, conflicts: [], renumbered: 0 };
    }
    throw e;
  }
  if (!conflicts.length) return { data, conflicts: [], renumbered: 0 };
  const byId = new Map(conflicts.filter(c => c.proposed && !c.locked).map(c => [c.docId, c]));
  if (!byId.size) return { data, conflicts, renumbered: 0 };
  const documents = data.documents.map(doc => {
    const fix = byId.get(doc.id);
    if (!fix) return doc;
    const next = { ...doc, number: fix.proposed, updatedAt: now };
    const newVs = safeVs(fix.proposed, vs);
    if (newVs !== null) next.vs = newVs;
    return next;
  });
  return { data: { ...data, documents, updatedAt: now }, conflicts, renumbered: byId.size };
}
