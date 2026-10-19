// Closing a VAT period (05-accounting-tax.md § 5.3.4, the Period Lock of
// WE Time Tracker): company.closedPeriods holds the keys of closed periods
// ("2026-07", "2026-Q3"). A document whose tax date falls into a closed
// period may not be changed, and no document may be moved into one, until
// the period is opened again on purpose; closing and opening are written
// to the audit log. Everything here is pure: the screen writes the patch
// through store.updateCompany and the entry through store.insert, and the
// document editor (WP-SALES, WP-PURCHASE) asks canChangeInPeriod first.
import { CoreError } from '../errors.js';
import { isPeriodKey, parsePeriod } from './periods.js';
import { documentDirection } from './treatment.js';

/** The date that places a document in a VAT period, or null. */
export function documentTaxPoint(document, company) {
  if (!document) return null;
  if (documentDirection(document, company) === 'IN') {
    if (document.vatDeductionPeriod && isPeriodKey(document.vatDeductionPeriod)) return parsePeriod(document.vatDeductionPeriod).to;
    return document.receivedDate || document.issueDate || document.taxDate || null;
  }
  return document.taxDate || document.issueDate || null;
}

/** The closed period a date falls into, or null. */
export function closedPeriodOf(company, date) {
  if (!date) return null;
  return (company && company.closedPeriods || []).filter(isPeriodKey).find(key => {
    const p = parsePeriod(key);
    return date >= p.from && date <= p.to;
  }) || null;
}

/** True when the period (or any part of it) is closed. */
export function isPeriodClosed(company, period) {
  const p = parsePeriod(period);
  return (company && company.closedPeriods || []).filter(isPeriodKey).some(key => {
    const c = parsePeriod(key);
    return c.from <= p.to && c.to >= p.from;
  });
}

/**
 * May a document be saved? Pass the stored version and the version to be
 * saved (either may be null for a new or a deleted document). Drafts and
 * documents that never carry VAT are always free.
 * @returns {{allowed: boolean, reason?: 'TAX_PERIOD_CLOSED', period?: string}}
 */
export function canChangeInPeriod(before, after, company) {
  for (const doc of [before, after]) {
    if (!doc || doc.status === 'DRAFT') continue;
    const period = closedPeriodOf(company, documentTaxPoint(doc, company));
    if (period) return { allowed: false, reason: 'TAX_PERIOD_CLOSED', period };
  }
  return { allowed: true };
}

function audit(action, period, now, reason, from, to) {
  return {
    at: now,
    action,
    entity: 'taxPeriod',
    entityId: period,
    changes: [{ field: 'closed', from, to }],
    reason: reason || null
  };
}

/**
 * Patch of the company and audit entry that close a period.
 * @returns {{patch: {closedPeriods: string[]}, audit: object}}
 */
export function closePeriod(company, period, now = new Date().toISOString()) {
  parsePeriod(period);
  const current = (company && company.closedPeriods) || [];
  if (current.includes(period)) throw new CoreError('TAX_PERIOD_ALREADY_CLOSED', `${period} is closed`);
  const closedPeriods = [...current, period].sort();
  return { patch: { closedPeriods }, audit: audit('PERIOD_CLOSE', period, now, null, false, true) };
}

/**
 * Patch and audit entry that open a closed period again. A reason is
 * required: it stays in the audit log.
 */
export function openPeriod(company, period, reason, now = new Date().toISOString()) {
  parsePeriod(period);
  const current = (company && company.closedPeriods) || [];
  if (!current.includes(period)) throw new CoreError('TAX_PERIOD_NOT_CLOSED', `${period} is not closed`);
  if (!reason || !String(reason).trim()) throw new CoreError('TAX_PERIOD_OPEN_REASON_REQUIRED', 'opening a closed period needs a reason');
  return { patch: { closedPeriods: current.filter(k => k !== period) }, audit: audit('PERIOD_OPEN', period, now, String(reason).trim(), true, false) };
}
