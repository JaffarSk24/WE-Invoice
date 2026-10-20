// Filed reports. When the user marks a report as filed (or downloads its
// XML), an audit entry records the report, the period, the kind of filing
// and a digest of the documents behind it. Later the screen compares the
// digest with the documents of today: a change after filing means an
// opravný or dodatočný report is due (§ 5.3.4: documents changed after
// export). Pure functions; the audit log lives in the auditLog collection.
import { filingDueDate } from './periods.js';

export const REPORTS = Object.freeze(['vatReturn', 'kv', 'sv']);
const ENTITY = 'taxReport';

/** FNV-1a over the documents of the records (id and last change). */
export function recordsDigest(records, documents) {
  const ids = [...new Set((records.entries || []).map(e => e.docId))].sort();
  const byId = new Map((documents || []).map(d => [d.id, d]));
  const text = ids.map(id => `${id}@${(byId.get(id) || {}).updatedAt || ''}`).join(';');
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${ids.length}:${hash.toString(16).padStart(8, '0')}`;
}

export function filingId(report, period) {
  return `${report}:${period}`;
}

/**
 * Audit entry fields for a filed or downloaded report.
 * @param {{report: string, period: string, type: string, status: 'FILED'|'DOWNLOADED', digest: string, at?: string}} input
 */
export function filingEntry({ report, period, type, status, digest, at = new Date().toISOString() }) {
  return {
    at,
    action: 'EXPORT',
    entity: ENTITY,
    entityId: filingId(report, period),
    changes: [{ field: 'status', from: null, to: status }, { field: 'type', from: null, to: type }, { field: 'digest', from: null, to: digest }],
    reason: null
  };
}

function field(entry, name) {
  const change = (entry.changes || []).find(c => c.field === name);
  return change ? change.to : null;
}

/** Filings of one report and period, oldest first. */
export function filingsOf(auditEntries, report, period) {
  const id = filingId(report, period);
  return (auditEntries || [])
    .filter(e => !e.deleted && e.entity === ENTITY && e.entityId === id && e.action === 'EXPORT')
    .map(e => ({ at: e.at, status: field(e, 'status'), type: field(e, 'type'), digest: field(e, 'digest') }))
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/**
 * State of a report for a period: filed or not, and whether the documents
 * changed since the last filing.
 * @returns {{filed: boolean, lastFiled: object|null, changedSinceFiling: boolean}}
 */
export function filingStatus(auditEntries, report, period, digest) {
  const filed = filingsOf(auditEntries, report, period).filter(f => f.status === 'FILED');
  const last = filed.length ? filed[filed.length - 1] : null;
  return { filed: Boolean(last), lastFiled: last, changedSinceFiling: Boolean(last && digest && last.digest !== digest) };
}

/**
 * The kind of filing to offer: riadny when nothing was filed; after a
 * filing, opravný until the deadline and dodatočný after it (§ 78a ods. 9,
 * § 16 daňového poriadku); the súhrnný výkaz the same (form SVDPHv20).
 */
export function suggestedFilingType(auditEntries, report, period, today) {
  const { filed } = filingStatus(auditEntries, report, period, null);
  if (!filed) return 'R';
  return today <= filingDueDate(period, report) ? 'O' : 'D';
}
