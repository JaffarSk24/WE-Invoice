// Reports and analytics (WP-REPORTS): sales and purchases by period,
// client, item, label and project; receivables and payables by age; the
// cash flow forecast; profitability; the global search index; the recycle
// bin and the change log. Pure functions on the records of the store,
// each concern in its own file; this one only gathers the API.
export { BASE_CURRENCY, isSaleDoc, isPurchaseDoc, isReceivableDoc, isPayableDoc, counts as countsInReports, eurAmounts, partyOf, reportDate } from './amounts.js';
export { GRANULARITIES, periodKey, periodKeys, previousYearKey, shiftYear } from './periods.js';
export { salesReport, changePct, DIRECTIONS } from './sales.js';
export { agingReport, agingBucket, AGING_BUCKETS } from './aging.js';
export { cashflowForecast, recurringRuns, paymentDelays, addMonths } from './cashflow.js';
export { profitability, averagePurchasePrices } from './profit.js';
export { searchIndex, searchQuery, fold, SEARCH_TYPES } from './search.js';
export { trashEntries, restoredRecord, purgedRecord, isArchived, TRASH_RETENTION_DAYS, TRASH_COLLECTIONS } from './trash.js';
export { auditEntryFor, auditAction, changedFields, filterAudit, AUDITED_COLLECTIONS } from './audit.js';
export { collectLabels, collectProjects, normalizeLabels } from './labels.js';
export { toCsv, decimalComma } from './csv.js';
