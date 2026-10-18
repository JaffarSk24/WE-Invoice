// Checks before a tax report is exported (05-accounting-tax.md § 5.3.4),
// on top of the problems the records already carry (missing tax or
// receipt dates, partner VAT ids, corrections without the original):
//   TOTALS_MISMATCH          stored totals differ from the recomputed ones
//   ADVANCE_LINK_BROKEN      a final invoice deducts an advance that is gone
//   ADVANCE_NOT_SETTLED      an advance tax document of the period has no
//                            final invoice yet (information)
//   CHANGED_AFTER_EXPORT     a document changed after it was exported
//   DRAFT_IN_PERIOD          drafts dated in the period are not counted
//   PERIOD_CLOSED            the period is closed (information)
import { cmp } from '../money/index.js';
import { computeTotals } from '../vat/index.js';
import { problem, sortProblems } from './problems.js';
import { isPeriodClosed } from './closing.js';
import { isRecordable } from './records.js';

const FIELDS = ['net', 'vat', 'gross'];

function totalsMismatch(document) {
  if (!document.totals || !document.lines) return false;
  const fresh = computeTotals(document);
  return FIELDS.some(f => document.totals[f] !== undefined && document.totals[f] !== null && cmp(document.totals[f], fresh[f]) !== 0);
}

/**
 * @param {ReturnType<import('./records.js').vatRecords>} records
 * @param {Array<object>} documents  all documents of the company
 * @param {object} company
 * @returns {Array<object>} the problems of the records and of these checks, errors first
 */
export function exportChecks(records, documents, company) {
  const problems = [...records.problems];
  const all = (documents || []).filter(d => d && !d.deleted);
  const byId = new Map(all.map(d => [d.id, d]));
  const inPeriod = new Set(records.entries.map(e => e.docId));

  for (const id of inPeriod) {
    const document = byId.get(id);
    if (!document) continue;
    try {
      if (totalsMismatch(document)) problems.push(problem('TOTALS_MISMATCH', document, { severity: 'error' }));
    } catch (e) {
      console.warn('Totals of a document could not be recomputed', document.id, e);
      problems.push(problem('TOTALS_MISMATCH', document, { severity: 'error' }));
    }
    for (const link of document.links || []) {
      if (link.kind === 'ADVANCE_DEDUCTION' && !byId.has(link.docId)) problems.push(problem('ADVANCE_LINK_BROKEN', document, { severity: 'error' }));
    }
    if (document.exportedAt && document.updatedAt && document.updatedAt > document.exportedAt) {
      problems.push(problem('CHANGED_AFTER_EXPORT', document, { severity: 'warning' }));
    }
    if (document.kind === 'ADVANCE_TAX_DOC' && !settled(document, all)) {
      problems.push(problem('ADVANCE_NOT_SETTLED', document, { severity: 'warning' }));
    }
  }
  for (const document of all) {
    if (document.status !== 'DRAFT') continue;
    if (!isRecordable({ ...document, status: 'ISSUED' })) continue;
    const date = document.taxDate || document.issueDate || document.receivedDate;
    if (date && date >= records.from && date <= records.to) problems.push(problem('DRAFT_IN_PERIOD', document, { severity: 'warning' }));
  }
  if (isPeriodClosed(company, records.period)) problems.push(problem('PERIOD_CLOSED', null, { severity: 'warning' }));
  return sortProblems(dedupe(problems));
}

// An advance is settled when a final invoice deducts it, directly or
// through the proforma it was issued for.
function settled(advance, all) {
  const proformas = (advance.links || []).filter(l => l.kind === 'FROM_PROFORMA').map(l => l.docId);
  return all.some(d => d.kind === 'INVOICE' && d.status !== 'CANCELLED' && (d.links || []).some(l => l.kind === 'ADVANCE_DEDUCTION' && (l.docId === advance.id || proformas.includes(l.docId))));
}

function dedupe(problems) {
  const seen = new Set();
  return problems.filter(p => {
    const key = `${p.code}|${p.docId || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
